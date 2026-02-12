# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Install system dependencies for OpenCV and DeepFace
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Set environment variables for performance and to suppress hardware warnings
ENV PORT=8080
ENV OMP_NUM_THREADS=1
ENV TF_CPP_MIN_LOG_LEVEL=2

# Run uvicorn using the socket_app wrapper (which includes both FastAPI and Socket.io)
CMD ["sh", "-c", "uvicorn api:socket_app --host 0.0.0.0 --port ${PORT}"]
