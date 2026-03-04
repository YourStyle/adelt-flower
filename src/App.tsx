import { useState, useEffect } from 'react'
import { AsciiFlower } from './components/AsciiFlower'
import { AsciiFlowerFast } from './components/AsciiFlowerFast'

function App() {
  const [page, setPage] = useState(() => window.location.hash)

  useEffect(() => {
    const handleHashChange = () => setPage(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (page === '#fast') {
    return <AsciiFlowerFast />
  }

  return (
    <>
      <AsciiFlower />
      <div style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
      }}>
        <button
          onClick={() => window.location.hash = 'fast'}
          style={{
            background: '#4a5568',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Fast (40fps)
        </button>
      </div>
    </>
  )
}

export default App
