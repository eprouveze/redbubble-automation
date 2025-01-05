### Redbubble AI Automation V1

This script provides two main functionalities:
1. Create and upload AI-generated images to Redbubble using ChatGPT and Replicate
2. Upload your own photos to Redbubble with AI-generated metadata

## Environment Setup

Create an `.env` file at the root of the project with the following variables:

```
REDBUBBLE_URL=https://www.redbubble.com/
OPENAI_API_KEY=sk-  # Your OpenAI API Key
REPLICATE_API_KEY=  # Your Replicate API Key
REDBUBBLE_LOGIN=    # Redbubble account email
REDBUBBLE_PW=       # Redbubble account password
START_DATE=         # Date of creation and setup of account information, YYYY-MM-DD

# Optional: Required only for uploading your own photos
REAL_PHOTOS_DIR=    # Path to your photos directory
DEBUG_MODE=true     # Set to true to review metadata before upload
```

## Installation

⚠️ **Important**: This project requires Node.js version 18.0.0 specifically. Other versions may cause compatibility issues.

### 1. Install Node.js v18.0.0

#### Option A: Using nvm (recommended)

First, install nvm (Node Version Manager):

For macOS/Linux:
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Add these lines to your ~/.zshrc (for macOS) or ~/.bashrc (for Linux)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Reload your shell configuration
source ~/.zshrc  # for macOS
# or
source ~/.bashrc  # for Linux
```

Then install and use Node.js 18.0.0:
```bash
nvm install 18.0.0
nvm use 18.0.0

# Verify the version
node --version  # Should output v18.0.0
```

#### Option B: Direct installation

For macOS:
```bash
# Using Homebrew
brew install node@18
brew link node@18

# Verify the version
node --version  # Should output v18.0.0
```

### 2. Install dependencies:
```bash
# Make sure you're in the project root directory
cd v1
npm install
```

### 3. For macOS users, install XQuartz (required for display handling):
```bash
brew install --cask xquartz
```

## Usage

First, make sure you're using Node.js 18.0.0:
```bash
# If using nvm:
nvm use 18.0.0

# Verify the version regardless of installation method:
node --version  # Should output v18.0.0
```

### 1. AI-Generated Images
To generate and upload AI-created images:

1. First, close ALL existing Chrome windows completely (⌘+Q on Mac, not just the windows)

2. Start Chrome with remote debugging enabled:
```bash
# For macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

3. Log into Redbubble manually in this Chrome window and navigate to your dashboard

4. Then in a new terminal window, run the script:
```bash
# Make sure you're in the v1 directory
cd v1
npm start
```

### 2. Upload Your Own Photos
To upload your existing photos:

1. First, close ALL existing Chrome windows completely (⌘+Q on Mac, not just the windows)

2. Start Chrome with remote debugging enabled (if not already running):
```bash
# For macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

3. Log into Redbubble manually in this Chrome window and navigate to your dashboard

4. Then in a new terminal window, run the script:
```bash
# Make sure you're in the v1 directory
cd v1
npm run upload-real-photos
```

If you encounter any "module not found" errors, try running the scripts directly:
```bash
# From the v1 directory
node ./src/index.js             # for AI-generated images
node ./src/uploadRealPhotos.js  # for uploading real photos
```

When `DEBUG_MODE=true`, the script will:
- Show you the generated metadata (title, description, tags) for each photo
- Ask for confirmation before uploading
- Upload the photo to Redbubble only after confirmation

## Project Structure
```
v1/
├── src/                    # Source code
│   ├── index.js           # Main script for AI-generated images
│   ├── uploadRealPhotos.js # Script for uploading real photos
│   ├── uploadPictureModule.js # Shared upload functionality
│   └── utils.js           # Utility functions
├── photos/                # Directory for your photos (configurable in .env)
├── logs/                  # Log files
└── package.json          # Project dependencies and scripts
```

## Troubleshooting

1. If `nvm` command is not found:
   - Make sure you've installed nvm using the instructions above
   - Make sure you've added the nvm configuration to your shell configuration file
   - Try opening a new terminal window after installation

2. If you get "module not found" errors:
   - Make sure you're in the `v1` directory
   - Try running `npm install` again
   - Verify you're using Node.js v18.0.0 with `node --version`

3. If you get permission errors:
   - Check that your `.env` file exists and has the correct credentials
   - For macOS users, ensure XQuartz is installed and running

## Ubuntu Automation Setup

If you want to set up automated uploads on Ubuntu, use these commands:

```bash
sudo apt update
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash

nvm install 18.0.0
nvm use 18.0.0
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -

sudo apt-get install -y xfce4 xfce4-goodies
sudo apt install xrdp -y
sudo systemctl enable xrdp
sudo reboot

sudo apt-get install -y nodejs
npm install -g npm@latest

sudo apt install cron
sudo systemctl enable cron

cd /redbubble-automation
chmod +x run.sh
#Check that EOL is Unix format (LF) 

sudo apt-get install -y libxi6 libxtst6 libcups2 libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libgtk-3-0 xvfb x11-xkb-utils xfonts-100dpi xfonts-75dpi xfonts-scalable xfonts-cyrillic x11-apps libx11-xcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 libxrandr2 libxshmfence1 libgbm1 libasound2

# Set up cron job to run every 30 minutes
crontab -e
*/30 * * * * /home/ubuntu/redbubble-automation/run.sh >> /home/ubuntu/redbubble-automation/cron.log 2>&1

sudo reboot
```

