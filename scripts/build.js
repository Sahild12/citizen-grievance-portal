const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectRoot, 'dist');
const htmlFiles = ['index.html', 'dashboard.html', 'official-dashboard.html'];

fs.mkdirSync(outputDirectory, { recursive: true });

for (const file of htmlFiles) {
    fs.copyFileSync(path.join(projectRoot, file), path.join(outputDirectory, file));
}

fs.cpSync(
    path.join(projectRoot, 'public'),
    path.join(outputDirectory, 'public'),
    { recursive: true }
);
