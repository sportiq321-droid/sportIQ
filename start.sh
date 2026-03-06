#!/bin/bash

# Ensure all child processes (like the background node server) are killed when this script exits
trap "kill 0" EXIT

# This script is already run from the project root, so we don't need to cd.

# Start the Node.js server in the background
echo "--- Starting Node.js server on port 3001 ---"
npm run start:node &

# Wait a few seconds for the Node server to initialize
sleep 5

# Start the Python AI worker using the full python path
echo "--- Starting Python AI worker on port 8000 ---"
cd ai_worker
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload