import socketio
import asyncio

# The client for testing
sio = socketio.AsyncClient()

async def test_signal():
    try:
        # 1. Connect to the local server
        print("Connecting to server...")
        await sio.connect('http://localhost:8000')
        print(f"Connected with SID: {sio.sid}")

        # 2. Define event handlers
        @sio.on('room_joined')
        def on_room_joined(data):
            print(f"Server Confirmation: Successfully joined {data['room']}")

        @sio.on('offer')
        def on_offer(data):
            print(f"Relay Test: Received Offer back from server: {data['content']}")

        # 3. Join a room
        room_name = 'test_room_123'
        print(f"Joining room: {room_name}")
        await sio.emit('join_room', {'room': room_name})
        
        # Give it a second to process
        await asyncio.sleep(1)

        # 4. Test relay (Note: room emit with skip_sid won't hit the sender, 
        # so this is just checking if we can emit without error)
        print("Emitting test offer...")
        await sio.emit('offer', {'room': room_name, 'content': 'Hello from test script'})
        
        await asyncio.sleep(1)
        print("Test Complete. Disconnecting...")
        await sio.disconnect()

    except Exception as e:
        print(f"Test Failed: {e}")

if __name__ == '__main__':
    asyncio.run(test_signal())
