require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

const publicDirectory = path.join(__dirname, '../public');
const webDirectory = path.join(__dirname, '..');
app.use(express.static(publicDirectory, { dotfiles: 'deny' }));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(webDirectory, 'index.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(webDirectory, 'dashboard.html')));
app.get('/official-dashboard.html', (req, res) => res.sendFile(path.join(webDirectory, 'official-dashboard.html')));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false
});
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false
});
app.use('/api/login', loginLimiter);
app.use('/api/register', registerLimiter);

// ==================== MONGOOSE SCHEMAS ====================
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    idNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    email: { type: String },
    phone: { type: String },
    role: { type: String, enum: ['citizen', 'official'], required: true },
    department: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const complaintSchema = new mongoose.Schema({
    citizenId: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    priority: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
    status: { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending' },
    department: { type: String },
    assigned: { type: String, default: 'Unassigned' },
    fileUrl: { type: String },
    filedDate: { type: Date, default: Date.now },
    resolvedDate: { type: Date },
    comments: [{ text: String, date: Date }],
    internalNotes: { type: String }
});

const User = mongoose.model('User', userSchema);
const Complaint = mongoose.model('Complaint', complaintSchema);

let connectionPromise;
async function connectToDatabase() {
    if (mongoose.connection.readyState === 1 && !connectionPromise) return;
    if (!connectionPromise) {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI is not configured.');

        const initialId = process.env.INITIAL_OFFICIAL_ID;
        const initialPassword = process.env.INITIAL_OFFICIAL_PASSWORD;
        if (Boolean(initialId) !== Boolean(initialPassword)) {
            throw new Error('Set both INITIAL_OFFICIAL_ID and INITIAL_OFFICIAL_PASSWORD, or neither.');
        }
        if (initialId && (initialId.trim().length < 5 || initialId.trim().length > 64)) {
            throw new Error('INITIAL_OFFICIAL_ID must be between 5 and 64 characters.');
        }
        if (initialPassword && (initialPassword.length < 16 || Buffer.byteLength(initialPassword, 'utf8') > 72)) {
            throw new Error('INITIAL_OFFICIAL_PASSWORD must be 16 or more characters and at most 72 UTF-8 bytes.');
        }

        connectionPromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
            .then(async () => {
                if (initialId && initialPassword) {
                    const existingOfficial = await User.exists({ role: 'official' });
                    if (!existingOfficial) {
                        await User.create({
                            name: 'Official Administrator',
                            idNumber: initialId.trim(),
                            password: await bcrypt.hash(initialPassword, 12),
                            role: 'official',
                            department: 'Administration'
                        });
                    }
                }
            })
            .catch((error) => {
                connectionPromise = undefined;
                throw error;
            });
    }
    await connectionPromise;
}
mongoose.connection.on('disconnected', () => {
    connectionPromise = undefined;
});

app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.get('origin');
        const fetchSite = req.get('sec-fetch-site');
        let sameOrigin = true;
        if (origin) {
            try {
                sameOrigin = new URL(origin).host === req.get('host');
            } catch {
                sameOrigin = false;
            }
        }
        if (fetchSite === 'cross-site' || !sameOrigin) {
            return res.status(403).json({ success: false, message: 'Cross-origin request rejected.' });
        }
    }
    next();
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('session', sessionCookie);
    res.json({ success: true });
});

app.use('/api', async (req, res, next) => {
    try {
        await connectToDatabase();
        next();
    } catch (error) {
        console.error('Database connection failed:', error.message);
        res.status(503).json({ success: false, message: 'The service is temporarily unavailable.' });
    }
});

const sessionCookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60 * 1000
};

function publicUser(user) {
    return {
        _id: user._id,
        name: user.name,
        role: user.role,
        department: user.department
    };
}

function createSession(user, res) {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.');
    }
    const token = jwt.sign(
        { role: user.role },
        secret,
        { subject: user._id.toString(), expiresIn: '15m', issuer: 'grievance-portal' }
    );
    res.cookie('session', token, sessionCookie);
}

function requireAuth(requiredRole) {
    return async (req, res, next) => {
        try {
            const secret = process.env.AUTH_SECRET;
            if (!secret || secret.length < 32) {
                return res.status(503).json({ success: false, message: 'Authentication is not configured.' });
            }
            const token = req.cookies.session;
            if (!token) return res.status(401).json({ success: false, message: 'Please log in.' });

            const payload = jwt.verify(token, secret, { issuer: 'grievance-portal' });
            if (typeof payload.sub !== 'string' || !['citizen', 'official'].includes(payload.role)) {
                res.clearCookie('session', sessionCookie);
                return res.status(401).json({ success: false, message: 'Please log in again.' });
            }
            const user = await User.findById(payload.sub).select('name idNumber role department');
            if (!user || user.role !== payload.role) {
                res.clearCookie('session', sessionCookie);
                return res.status(401).json({ success: false, message: 'Please log in again.' });
            }
            if (requiredRole && user.role !== requiredRole) {
                return res.status(403).json({ success: false, message: 'You do not have permission.' });
            }
            req.user = user;
            next();
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                res.clearCookie('session', sessionCookie);
                return res.status(401).json({ success: false, message: 'Please log in again.' });
            }
            next(error);
        }
    };
}

app.post('/api/login', async (req, res) => {
    try {
        const { idNumber, password, role } = req.body || {};
        if (typeof idNumber !== 'string' || typeof password !== 'string' ||
            password.length > 1024 || !['citizen', 'official'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Enter a valid ID, password, and account type.' });
        }

        const user = await User.findOne({ idNumber: idNumber.trim(), role }).select('+password');
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

        const isHashed = /^\$2[aby]\$/.test(user.password);
        let passwordMatches;
        if (isHashed) {
            passwordMatches = await bcrypt.compare(password, user.password);
        } else {
            const provided = Buffer.from(password);
            const stored = Buffer.from(user.password);
            passwordMatches = provided.length === stored.length && crypto.timingSafeEqual(provided, stored);
            if (passwordMatches) {
                user.password = await bcrypt.hash(password, 12);
                await user.save();
            }
        }
        if (!passwordMatches) return res.status(401).json({ success: false, message: 'Invalid credentials.' });

        createSession(user, res);
        res.json({ success: true, user: publicUser(user) });
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ success: false, message: 'Unable to log in right now.' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, idNumber, email, phone, password } = req.body || {};
        if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100 ||
            typeof idNumber !== 'string' || idNumber.trim().length < 5 || idNumber.trim().length > 64 ||
            typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            typeof phone !== 'string' || !/^\d{10}$/.test(phone.replace(/\D/g, '')) ||
            typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
            return res.status(400).json({
                success: false,
                message: 'Enter valid details. Passwords must be at least 12 characters.'
            });
        }

        const user = await User.create({
            name: name.trim(),
            idNumber: idNumber.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            password: await bcrypt.hash(password, 12),
            role: 'citizen'
        });
        res.status(201).json({ success: true, message: 'Registration successful.', user: publicUser(user) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'This ID is already registered.' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, message: 'Please check the information you entered.' });
        }
        console.error('Registration error:', error.message);
        res.status(500).json({ success: false, message: 'Unable to register right now.' });
    }
});

app.get('/api/me', requireAuth(), (req, res) => {
    res.json({ success: true, user: publicUser(req.user) });
});

app.post('/api/refresh', requireAuth(), (req, res) => {
    try {
        createSession(req.user, res);
        res.json({ success: true });
    } catch (error) {
        console.error('Session refresh error:', error.message);
        res.status(503).json({ success: false, message: 'Unable to refresh your session.' });
    }
});

app.get('/api/complaints/:userId', requireAuth(), async (req, res) => {
    try {
        if (req.params.userId === 'all' && req.user.role !== 'official') {
            return res.status(403).json({ success: false, message: 'You do not have permission.' });
        }
        const query = req.user.role === 'official'
            ? (req.params.userId === 'all' ? {} : { citizenId: req.user._id.toString() })
            : { citizenId: req.user._id.toString() };
        const complaintQuery = Complaint.find(query);
        if (req.user.role !== 'official') complaintQuery.select('-internalNotes');
        const complaints = await complaintQuery;
        res.json(complaints);
    } catch (error) {
        console.error('Complaint list error:', error.message);
        res.status(500).json({ success: false, message: 'Unable to load complaints.' });
    }
});

app.post('/api/complaints', requireAuth('citizen'), async (req, res) => {
    try {
        const { title, category, description, location, latitude, longitude, priority } = req.body;
        const categories = ['Roads', 'Water', 'Electricity', 'Sanitation', 'Other'];
        if (typeof title !== 'string' || title.trim().length < 5 || title.trim().length > 150 ||
            !categories.includes(category) ||
            typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 5000 ||
            typeof location !== 'string' || location.trim().length < 2 || location.trim().length > 300 ||
            !['Low', 'Medium', 'High', 'Critical'].includes(priority)) {
            return res.status(400).json({ success: false, message: 'Please provide valid complaint details.' });
        }

        const complaint = await Complaint.create({
            citizenId: req.user._id.toString(),
            title: title.trim(),
            category,
            description: description.trim(),
            location: location.trim(),
            latitude: Number.isFinite(latitude) ? latitude : undefined,
            longitude: Number.isFinite(longitude) ? longitude : undefined,
            priority,
            status: 'Pending',
            department: 'Public Works'
        });
        res.status(201).json({ success: true, message: 'Complaint filed successfully.', complaint });
    } catch (error) {
        console.error('Complaint create error:', error.message);
        res.status(500).json({ success: false, message: 'Unable to file this complaint.' });
    }
});

app.put('/api/complaints/:id', requireAuth('official'), async (req, res) => {
    try {
        const { status, assigned, priority, internalNotes } = req.body || {};
        const update = {};
        if (status !== undefined) {
            if (!['Pending', 'In Progress', 'Resolved'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid complaint status.' });
            }
            update.status = status;
            update.resolvedDate = status === 'Resolved' ? new Date() : undefined;
        }
        if (assigned !== undefined) {
            if (typeof assigned !== 'string' || assigned.length > 100) {
                return res.status(400).json({ success: false, message: 'Invalid assignee.' });
            }
            update.assigned = assigned;
        }
        if (priority !== undefined) {
            if (!['Low', 'Medium', 'High', 'Critical'].includes(priority)) {
                return res.status(400).json({ success: false, message: 'Invalid priority.' });
            }
            update.priority = priority;
        }
        if (internalNotes !== undefined) {
            if (typeof internalNotes !== 'string' || internalNotes.length > 5000) {
                return res.status(400).json({ success: false, message: 'Invalid internal notes.' });
            }
            update.internalNotes = internalNotes;
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid updates provided.' });
        }

        const complaint = await Complaint.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true
        });
        if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
        res.json({ success: true, complaint });
    } catch (error) {
        console.error('Complaint update error:', error.message);
        res.status(400).json({ success: false, message: 'Unable to update this complaint.' });
    }
});

app.get('/api/stats/all', requireAuth('official'), async (req, res) => {
    try {
        const complaints = await Complaint.find().select('status');
        res.json({
            total: complaints.length,
            pending: complaints.filter(c => c.status === 'Pending').length,
            resolved: complaints.filter(c => c.status === 'Resolved').length,
            inProgress: complaints.filter(c => c.status === 'In Progress').length,
            avgResolutionTime: '5.2d'
        });
    } catch (error) {
        console.error('Statistics error:', error.message);
        res.status(500).json({ success: false, message: 'Unable to load statistics.' });
    }
});

app.get('/api/stats/:userId', requireAuth(), async (req, res) => {
    try {
        if (req.params.userId === 'all' && req.user.role !== 'official') {
            return res.status(403).json({ success: false, message: 'You do not have permission.' });
        }
        const query = req.user.role === 'official' && req.params.userId === 'all'
            ? {}
            : { citizenId: req.user._id.toString() };
        const complaints = await Complaint.find(query).select('status');
        res.json({
            total: complaints.length,
            pending: complaints.filter(c => c.status === 'Pending').length,
            resolved: complaints.filter(c => c.status === 'Resolved').length,
            inProgress: complaints.filter(c => c.status === 'In Progress').length
        });
    } catch (error) {
        console.error('Statistics error:', error.message);
        res.status(500).json({ success: false, message: 'Unable to load statistics.' });
    }
});

app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: 'API route not found.' });
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'Request must contain valid JSON.' });
    }
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'Request is too large.' });
    }
    console.error('Request error:', error.message);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
});

if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`Grievance portal listening on port ${port}`));
}

module.exports = app;
