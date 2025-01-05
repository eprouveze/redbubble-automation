#!/bin/bash

# Check if XQuartz is running and kill it if it is
if pgrep Xquartz > /dev/null; then
    killall Xquartz
fi

# Start XQuartz
open -a XQuartz

# Wait for XQuartz to start
sleep 2

# Set the DISPLAY variable to use XQuartz
export DISPLAY=:0

# Navigate to the project directory
cd redbubble-scrapper/ || exit

# Start the application
npm start

# Optionally, kill XQuartz after the script finishes
if pgrep Xquartz > /dev/null; then
    killall Xquartz
fi
