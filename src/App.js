import { useState, useRef } from "react"

const AVATAR = 'vadim'
const VOICE = 'flq6f7yk4E4fJM5XTYuZ'

/**
 * simple wrapper for your API requests
 * 
 * IMPORTANT!
 * Do not use your Elai API KEY directly in frontend apps in production.
 * Use your own API as proxy, handle security properly.
 */
const request = async ({ method, url, data }) => {
  //const response = await fetch('http://localhost:3001/api/v1/' + url, {
  const response = await fetch('https://apis.elai.io/api/v1/' + url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.REACT_APP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: data ? JSON.stringify(data) : undefined,
  })

  const body = await response.json()

  if(response.status !== 200 && body?.message) alert(body.message)

  return body
}

let peerConnection

function App() {
  const videoRef = useRef(null)
  const [text, setText] = useState('Type text that avatar will say')

  const processOffer = async ({ offer, iceServers, streamId }) => {
    peerConnection = new RTCPeerConnection({ iceTransportPolicy: 'relay', iceServers })
    peerConnection.onicecandidate = async (e) => {
      if (!e.candidate) return

      // it's required to submit each webRTC candidate to Elai API to setup proper webRTC connection
      await request({
        method: 'POST',
        url: `streams/candidate/${streamId}`,
        data: { candidate: e.candidate }
      })
    }

    // you can use this event to check when the connection is established and start your stream
    peerConnection.onicegatheringstatechange = (e) => {
      const { iceGatheringState } = e.target
      if (iceGatheringState === 'complete' && videoRef?.current?.paused && videoRef?.current?.srcObject) {
        videoRef.current.play()
      }
    }

    peerConnection.ontrack = async (event) => {
      const [remoteStream] = event.streams
      videoRef.current.srcObject = remoteStream
    }

    // set offer from API as remote description
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

    // create answer and set as local description
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)

    // send answer to API to finalize your webRTC connection
    await request({ method: 'PUT', url: `streams/${streamId}`, data: { answer } })
  }

  const startStream = async () => {
    /**
     * Store streamId in localstorage so in case of page reload you can retrieve the same stream that was already initialized
     */
    const streamId = localStorage.getItem("streamId")

    let stream
    if (streamId) {
      // if we have streamId let's retrieve it's data from server
      stream = await request({
        method: 'GET',
        url: `streams/${streamId}`,
      })

      // if for some reason we can't get stream data from server - it means stream is already expired
      if(!stream.id) localStorage.removeItem("streamId")
    } else {
      // If there is no streamId - we initialize a new one
      stream = await request({
        method: 'POST',
        url: 'streams',
        data: {
          // to get a list of supported avatars call this API https://elai.readme.io/reference/avatars-list with realtime=true query param
          avatarCode: AVATAR,
          // only elevenlabs provider is supported for now. call https://elai.readme.io/reference/voices-list to see a list of supported voices
          voiceId: VOICE,
          voiceProvider: "elevenlabs"
        }
      })
      // store new streamId to localstorage so we can reuse it after reload
      localStorage.setItem("streamId", stream.id)
    }

    // if for some reason we don't have webRTC data - we would need to start over, remove stream ID 
    if (!stream?.webrtcData) {
      localStorage.removeItem("streamId")
      return
    }

    const { offer, iceServers } = stream.webrtcData
    await processOffer({ offer, iceServers, streamId: stream.id })
  }

  const closeStream = async () => {
    videoRef.current.srcObject = null

    const streamId = localStorage.getItem("streamId")
    if (streamId) {
      await request({
        method: 'DELETE',
        url: `streams/${streamId}`,
      })
      localStorage.removeItem("streamId")
    }
  }

  const renderText = async () => {
    const streamId = localStorage.getItem("streamId")
    if (streamId) {
      await request({
        method: 'POST',
        url: `streams/render/${streamId}`,
        data: { text },
      })
    }
  }

  const interrupt = async () => {
    const streamId = localStorage.getItem("streamId")
    if (streamId) {
      await request({
        method: 'DELETE',
        url: `streams/render/${streamId}`
      })
    }
  }

  return (
    <div>
      <header className="App-header">
        <video ref={videoRef} autoPlay controls />
        <div style={{ margin: '5px 0'}}>
          <button onClick={startStream} >Start Stream</button>
          <button onClick={closeStream} >Close Stream</button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} cols={40} />
        <div>
          <button onClick={renderText} >Render Text</button>
          <button onClick={interrupt} >Interrupt</button>
        </div>
      </header>
    </div>
  );
}

export default App
