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

# Set a default port if the PORT env var is not set (for local testing)
ENV PORT=8080

# Run uvicorn when the container launches, binding to the $PORT env var
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT}"]
