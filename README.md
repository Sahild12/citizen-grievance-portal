# Citizen Grievance Portal

A modern and user-friendly web application designed to help citizens report civic issues, track complaint progress, and enable government or authorized officials to manage and resolve grievances efficiently.

This portal bridges the gap between the public and administration by offering a simple workflow for complaint submission, real-time status tracking, and department-based grievance handling.

## Project Overview

The Citizen Grievance Portal is built to simplify the way people raise concerns related to public services such as:

- Road and infrastructure problems
- Water and sanitation issues
- Streetlight and electricity complaints
- General civic service requests

Citizens can submit complaints with important details such as category, priority, description, location, and supporting files. Officials can then review, assign, and update the progress of each complaint through a dedicated dashboard.

## Key Features

- **Citizen Registration and Login**
  - Secure role-based access for citizens and officials.

- **Complaint Submission**
  - Users can file new grievances with a clear title, category, description, location, and priority level.

- **Complaint Tracking**
  - Submitted complaints can be monitored with statuses such as Pending, In Progress, and Resolved.

- **Official Dashboard**
  - Authorized officials can manage grievances, assign them to departments, and update their current status.

- **Department-Based Management**
  - Complaints can be grouped and handled by specific departments for better administration.

- **Responsive User Interface**
  - Clean, accessible design for desktop and mobile-friendly interaction.

## Technology Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MongoDB with Mongoose
- **Additional Libraries:** bcrypt, JSON Web Tokens, Helmet, Express Rate Limit, Remix Icon

## Project Structure

```bash
gravience-portal/
├── public/
│   ├── css/
│   └── js/
├── src/
│   └── server.js
├── .env.example
├── dashboard.html
├── index.html
├── official-dashboard.html
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js
- npm
- MongoDB (local or cloud-based)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/Sahild12/citizen-grievance-portal.git
   ```

2. Navigate to the project directory
   ```bash
   cd citizen-grievance-portal
   ```

3. Install dependencies
   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env` and fill in your Atlas connection string and locally generated secrets. Keep `.env` private; it is ignored by Git.

   In PowerShell:
   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

5. Start the application
   ```bash
   npm start
   ```

6. Open your browser and visit
   ```bash
   http://localhost:3000
   ```

### Create the first official account

Set `INITIAL_OFFICIAL_ID` and `INITIAL_OFFICIAL_PASSWORD` before the first run against an empty database. The password must be at least 16 characters. The account is created only when the database has no official account. The application does not create default demo users or complaints.

```powershell
$env:INITIAL_OFFICIAL_ID = 'your-official-login-id'
$env:INITIAL_OFFICIAL_PASSWORD = 'a-unique-password-with-at-least-16-characters'
```

Use a new database for a real deployment; the earlier demo database may contain sample accounts and complaints. Never reuse the sample passwords or publish any database connection string or authentication secret.

### Deploy to Vercel

The Express application is exported from `src/server.js`, which Vercel detects automatically. The website and API use the same domain.

1. Push this repository to GitHub and import it in Vercel.
2. In Vercel, open the project settings and add these environment variables for the Production environment:
   - `MONGODB_URI`: the connection string for a **new** Atlas database.
   - `AUTH_SECRET`: a randomly generated secret with at least 32 characters. Generate one locally with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` and paste it directly into Vercel. Do not commit or share it.
   - `INITIAL_OFFICIAL_ID`: the official login ID.
   - `INITIAL_OFFICIAL_PASSWORD`: a unique password with at least 16 characters.
3. Configure Atlas Network Access to allow the Vercel deployment to reach the database. For real personal data, use a fixed/secure egress option supported by your hosting plan; do not allow every IP address (`0.0.0.0/0`).
4. Deploy. Vercel redeploys when you push later changes to the connected GitHub branch.

The initial official account is created only if the database has no officials. If you connect a database containing an old demo official account, remove or replace that account in Atlas before using the deployment.

### Security notes

- Passwords are hashed with bcrypt; passwords from an older database are upgraded to hashes after a successful login. Reset or remove old demo accounts before real users sign up.
- API requests require an authenticated session cookie. Only officials can view all complaints or update them; citizens can access only their own complaints.
- The session signing secret and database URI must be configured outside source control.
- The included in-memory rate limiter is a basic safeguard, not shared across Vercel instances. Before handling real users or sensitive information, configure a shared rate-limit store, account recovery and verification, database backups, and have the deployment reviewed for your privacy and legal requirements.

## Screenshots

This section is ready for your screenshots. Once you upload images, replace the placeholder blocks below with your final visuals.

### 1. Citizen Dashboard

![Citizen Dashboard Placeholder](./screenshots/citizen-dashboard.png)

> Add a screenshot of the citizen-facing dashboard here.

### 2. Complaint Submission Form

![Complaint Form Placeholder](./screenshots/complaint-form.png)

> Add a screenshot showing how citizens submit a grievance.

### 3. Official Dashboard

![Official Dashboard Placeholder](./screenshots/official-dashboard.png)

> Add a screenshot of the official management interface here.

### 4. Complaint Status Tracking

![Status Tracking Placeholder](./screenshots/status-tracking.png)

> Add a screenshot that highlights complaint progress and status updates.

## How It Works

1. A citizen logs in or registers an account.
2. The user submits a grievance with category, description, and location details.
3. The complaint is stored in the database and appears in the system.
4. Officials review and update the complaint status through the admin dashboard.
5. Citizens can track the progress until the issue is resolved.

## License

This project is licensed under the ISC License.

## Contribution

Contributions are welcome. If you would like to improve the portal, feel free to open an issue or submit a pull request.
