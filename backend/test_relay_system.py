import socketio
import asyncio
import httpx
import base64

# The Interviewer client (listening)
interviewer_sio = socketio.AsyncClient()

async def run_interviewer():
    @interviewer_sio.on('ai_results')
    def on_ai_results(data):
        print(f"\n[INTERVIEWER] RECEIVED LIVE DATA: {data}")

    @interviewer_sio.on('vocal_results')
    def on_vocal_results(data):
        print(f"\n[INTERVIEWER] RECEIVED VOCAL DATA: {data}")

    print("Interviewer connecting...")
    await interviewer_sio.connect('http://localhost:8000')
    await interviewer_sio.emit('join_room', {'room': 'room_abc'})
    print("Interviewer joined room_abc and is waiting...")

async def simulate_candidate():
    print("Candidate starting simulated analysis via HTTP...")
    # A valid 1x1 black pixel JPEG base64 string (no spaces)
    valid_tiny_jpeg = (
        "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACE="
        "=="
    )
    
    async with httpx.AsyncClient() as client:
        # This triggers the backend to perform analysis and then SIT.emit results to room_abc
        response = await client.post(
            'http://localhost:8000/analyze',
            json={
                "image": valid_tiny_jpeg,
                "session_id": "test_candidate_123",
                "room_id": "room_abc"
            },
            timeout=10.0
        )
        print(f"Candidate HTTP Status: {response.status_code}")
        print(f"Candidate Backend Response: {response.json()}")

async def main():
    # Start interviewer in background
    await run_interviewer()
    
    # Wait for things to settle
    await asyncio.sleep(2)
    
    # Simulate candidate frame
    await simulate_candidate()
    
    # Wait for relay
    await asyncio.sleep(2)
    await interviewer_sio.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
