from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2
import uvicorn
import json
import asyncio
from face_analyzer import FaceAnalyzer

app = FastAPI()

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
cap = None
analyzer = None

@app.on_event("startup")
async def startup_event():
    global cap, analyzer
    # Initialize Camera
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
    
    # Initialize Analyzer
    analyzer = FaceAnalyzer()
    analyzer.start()
    print("System Started")

@app.on_event("shutdown")
async def shutdown_event():
    global cap, analyzer
    if analyzer:
        analyzer.stop()
    if cap and cap.isOpened():
        cap.release()
    print("System Shutdown")

def generate_frames():
    global cap, analyzer
    
    # Auto-restart camera if it's closed
    if cap is None or not cap.isOpened():
        print("Starting camera...")
        cap = cv2.VideoCapture(0)
    
    # Auto-restart analyzer if it's stopped/missing
    if analyzer is None or analyzer.stopped:
        print("Starting analyzer...")
        analyzer = FaceAnalyzer()
        analyzer.start()

    while True:
        if cap is None or not cap.isOpened():
            break
            
        success, frame = cap.read()
        if not success:
            break
            
        # Process frame
        if analyzer:
             analyzer.process_frame(frame)
             faces_data = analyzer.get_latest_result()
        else:
             faces_data = None
        
        # Draw bounding box (Reuse logic for visual feedback in stream)
        if faces_data:
            face = faces_data[0]
            if 'region' in face:
                region = face['region']
                x, y, w, h = region['x'], region['y'], region['w'], region['h']
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
                
                # Optionally draw emotion text on stream
                dominant_emotion = face.get('dominant_emotion', 'N/A')
                cv2.putText(frame, dominant_emotion.upper(), (x, y - 10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

        # Encode frame
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        
        # Yield frame in MJPEG format
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.get("/video_feed")
async def video_feed():
    return StreamingResponse(generate_frames(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/current_emotion")
async def get_current_emotion():
    global analyzer
    if analyzer:
        data = analyzer.get_latest_result()
        if data and len(data) > 0:
            face = data[0]
            return {
                "detected": True,
                "dominant_emotion": face.get('dominant_emotion'),
                "emotions": face.get('emotion'),
                "region": face.get('region')
            }
    return {"detected": False}

@app.post("/shutdown")
async def shutdown_app():
    global cap, analyzer
    print("Shutting down resources...")
    if analyzer:
        analyzer.stop()
    if cap and cap.isOpened():
        cap.release()
    
    # In a real production server, we might rely on the process manager (like systemd or docker) 
    # to kill the process, but for local dev with uvicorn, we can rely on OS signals 
    # or just releasing resources is enough to turn off the camera light.
    # To truly kill the server:
    import os, signal
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutdown_initiated"}

@app.post("/release_camera")
async def release_camera():
    global cap, analyzer
    print("Releasing camera...")
    if analyzer:
        analyzer.stop()
        analyzer = None  # Reset to None so it can be restarted
    if cap and cap.isOpened():
        cap.release()
        cap = None # Reset to None
    return {"status": "camera_released"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
