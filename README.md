# Interview Assistant (Emotion AI)

This project is a Real-Time Emotion Detection system using DeepFace, MediaPipe, FastAPI, and Next.js.
It analyzes your facial expressions via webcam and displays live emotion probabilities.

## Project Structure

*   **/backend**: Python (FastAPI + DeepFace)
    *   `api.py`: The web server (runs on port 8000).
    *   `main.py`: The standalone desktop app (runs on OpenCV window).
    *   `face_analyzer.py`: The shared core logic.
*   **/frontend**: TypeScript (Next.js + Tailwind)
    *   Runs on port 3000.
    *   Connects to the backend video stream.

## Setup Instructions

### 1. Backend Setup
```bash
cd backend
# (Ensure your venv is active)
pip install fastapi uvicorn deepface mediapipe opencv-python tensorflow tf-keras python-multipart

# Run the API Server
python api.py
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Usage
Open `http://localhost:3000` in your browser.
Click "Start Camera" to begin analysis.

## Tech Stack
*   **AI**: DeepFace (Emotion Model), MediaPipe (Face Detection)
*   **Backend**: FastAPI (Python)
*   **Frontend**: Next.js, TailwindCSS
