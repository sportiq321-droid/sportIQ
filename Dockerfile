FROM node:18-bullseye

# Install Python and OpenCV dependencies
RUN apt-get update && apt-get install -y python3 python3-pip libgl1-mesa-glx

# Hugging Face requires the main web server to run on port 7860
ENV PORT=7860

WORKDIR /app

# Setup Python AI Worker
COPY ai_worker/requirements.txt ./ai_worker/
RUN pip3 install -r ai_worker/requirements.txt uvicorn

# Setup Node.js App
COPY package*.json ./
RUN npm install
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Make sure the start script is executable
RUN chmod +x start.sh

# Expose the port HF expects
EXPOSE 7860

# Start both servers
CMD ["bash", "start.sh"]