import React, { useState, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { JEELIZFACEFILTER, NN_4EXPR } from 'facefilter'
import { JeelizThreeFiberHelper } from './contrib/faceFilter/JeelizThreeFiberHelper.js'

// ====================== CONFIG ======================
const _maxFacesDetected = 1
const _faceFollowers = new Array(_maxFacesDetected)
let _expressions = null

// ====================== MODEL CONFIG ======================
const modelPositions = {
  hat: [0, 0.7, 0.6],
  glass: [-0.1, 0.4, 0.6],
}

const listOfAvailableModels = Object.keys(modelPositions)

// ====================== GENERIC MODEL LOADER ======================
const FaceModel = ({ modelName }) => {
  const { scene } = useGLTF(`/models/${modelName}.glb`)
  const position = modelPositions[modelName] || [0, 0, 0]

  return (
    <primitive
      object={scene}
      scale={0.55}
      position={position}
    />
  )
}

// ====================== FACE FOLLOWER ======================
const FaceFollower = ({ faceIndex, expression, modelName }) => {
  const objRef = useRef()
  const mouthOpenRef = useRef()
  const mouthSmileRef = useRef()

  useEffect(() => {
    _faceFollowers[faceIndex] = objRef.current
  }, [faceIndex])

  useFrame(() => {
    if (mouthOpenRef.current) {
      const s0 = Math.max(0.001, expression.mouthOpen)
      mouthOpenRef.current.scale.set(s0, 1, s0)
    }

    if (mouthSmileRef.current) {
      const s1 = Math.max(0.001, expression.mouthSmile)
      mouthSmileRef.current.scale.set(s1, 1, s1)
    }
  })

  return (
    <object3D ref={objRef}>
      <FaceModel modelName={modelName} />

      {/* Optional debug mouth indicators */}
      <mesh ref={mouthOpenRef} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.2, 0.2]}>
        <cylinderGeometry args={[0.3, 0.3, 1, 32]} />
        <meshBasicMaterial color={0xff0000} />
      </mesh>

      <mesh ref={mouthSmileRef} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.2, 0.2]}>
        <cylinderGeometry args={[0.5, 0.5, 1, 32, 1, false, -Math.PI / 2, Math.PI]} />
        <meshBasicMaterial color={0xff0000} />
      </mesh>
    </object3D>
  )
}

// ====================== CAMERA GRABBER ======================
let _threeFiber = null
const ThreeGrabber = ({ sizing }) => {
  _threeFiber = useThree()
  useFrame(JeelizThreeFiberHelper.update_camera.bind(null, sizing, _threeFiber.camera))
  return null
}

// ====================== SIZING HELPER ======================
const compute_sizing = () => {
  const height = window.innerHeight
  const wWidth = window.innerWidth
  const width = Math.min(wWidth, height)
  const top = 0
  const left = (wWidth - width) / 2
  return { width, height, top, left }
}

// ====================== MAIN COMPONENT ======================
const AppCanvas = () => {
  const [modelToBeLoaded, setModelToBeLoaded] = useState('hat')
  const [sizing, setSizing] = useState(compute_sizing())
  const [isInitialized] = useState(true)
  const faceFilterCanvasRef = useRef(null)
  let _timerResize = null

  // initialize expression state
  _expressions = []
  for (let i = 0; i < _maxFacesDetected; ++i) {
    _expressions.push({
      mouthOpen: 0,
      mouthSmile: 0,
      eyebrowFrown: 0,
      eyebrowRaised: 0,
    })
  }

  // ======= HANDLE RESIZE =======
  const handle_resize = () => {
    if (_timerResize) clearTimeout(_timerResize)
    _timerResize = setTimeout(do_resize, 200)
  }

  const do_resize = () => {
    _timerResize = null
    const newSizing = compute_sizing()
    setSizing(newSizing)
  }

  useEffect(() => {
    if (!_timerResize) JEELIZFACEFILTER.resize()
  }, [sizing])

  // ======= JEELIZ CALLBACKS =======
  const callbackReady = (errCode, spec) => {
    if (errCode) {
      console.log('❌ ERROR INITIALIZING JEELIZ:', errCode)
      return
    }
    console.log('✅ JEELIZFACEFILTER READY')
    JeelizThreeFiberHelper.init(spec, _faceFollowers, callbackDetect)
  }

  const callbackTrack = (detectStatesArg) => {
    const detectStates = detectStatesArg.length ? detectStatesArg : [detectStatesArg]
    JeelizThreeFiberHelper.update(detectStates, _threeFiber.camera)
    JEELIZFACEFILTER.render_video()
    detectStates.forEach((detectState, faceIndex) => {
      const exprIn = detectState.expressions
      const expression = _expressions[faceIndex]
      expression.mouthOpen = exprIn[0]
      expression.mouthSmile = exprIn[1]
      expression.eyebrowFrown = exprIn[2]
      expression.eyebrowRaised = exprIn[3]
    })
  }

  const callbackDetect = (faceIndex, isDetected) => {
    console.log(isDetected ? '😎 FACE DETECTED' : '🙈 FACE LOST')
  }

  // ======= INIT JEELIZ =======
  useEffect(() => {
    window.addEventListener('resize', handle_resize)
    window.addEventListener('orientationchange', handle_resize)

    JEELIZFACEFILTER.init({
      canvas: faceFilterCanvasRef.current,
      NNC: NN_4EXPR,
      maxFacesDetected: 1,
      followZRot: true,
      callbackReady,
      callbackTrack,
    })

    return () => {
      JEELIZFACEFILTER.destroy()
      window.removeEventListener('resize', handle_resize)
      window.removeEventListener('orientationchange', handle_resize)
    }
  }, [isInitialized])

  // ======= RENDER =======
  return (
    <div>
      {/* Model switcher buttons */}
      <div style={{ position: 'fixed', top: 20, left: 20, zIndex: 5 }}>
        {listOfAvailableModels.map((m) => (
          <button
            key={m}
            onClick={() => setModelToBeLoaded(m)}
            style={{
              marginRight: 10,
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: modelToBeLoaded === m ? '#0d6efd' : '#ccc',
              color: modelToBeLoaded === m ? 'white' : 'black',
              cursor: 'pointer',
            }}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 3D Canvas */}
      <Canvas
        className='mirrorX'
        style={{
          position: 'fixed',
          zIndex: 2,
          ...sizing,
        }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[0, 1, 1]} />
        <ThreeGrabber sizing={sizing} />
        <FaceFollower
          faceIndex={0}
          expression={_expressions[0]}
          modelName={modelToBeLoaded}
        />
      </Canvas>

      {/* Video Canvas */}
      <canvas
        className='mirrorX'
        ref={faceFilterCanvasRef}
        style={{
          position: 'fixed',
          zIndex: 1,
          ...sizing,
        }}
        width={sizing.width}
        height={sizing.height}
      />
    </div>
  )
}

export default AppCanvas
