import HeatmapContainer from "./components/HeatmapContainer";
import { activeSymbol } from './ui/store';

function App() {
  return (
    <div style="color: #1e293b; height: 100vh; width: 100vw; overflow: hidden; position: relative;">
      <header style={{
        padding: '1rem 1.5rem',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0.9))',
        'backdrop-filter': 'blur(8px) saturate(2.0)',
        '-webkit-backdrop-filter': 'blur(8px) saturate(2.0)',
        'border-bottom': '1px solid rgba(255, 255, 255, 0.3)',
        'border-top': '1px solid rgba(255, 255, 255, 0.7)',
        'box-shadow': '0 10px 30px rgba(0, 0, 0, 0.05), inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        'z-index': '30',
        position: 'relative',
      }}>
        <h1 style={{
          margin: '0',
          'font-size': '1.2rem',
          'font-weight': '800',
          color: '#1e293b',
          'letter-spacing': '-0.02em',
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
        }}>
          <span style={{ color: '#3b82f6' }}>{activeSymbol().replace('USDT', '/USDT')}</span>{' '}
          Binance Order Book Depth Heatmap
        </h1>

        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '20px',
        }}>
          <a 
            href="https://github.com/sahmed0" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              'align-items': 'center',
              color: '#1e293b',
              'text-decoration': 'none',
              transition: 'all 0.2s',
              opacity: '0.8',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.8';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <div style={{
            height: '16px',
            width: '1px',
            background: 'rgba(59, 130, 246, 0.2)',
          }} />
          <span style={{
            'font-size': '12px',
            'font-weight': '600',
            color: '#64748b',
            opacity: '0.8',
            'letter-spacing': '0.02em',
          }}>
            &copy; 2026 Sajid Ahmed
          </span>
        </div>
      </header>

      <main style="position: relative; height: calc(100% - 52px);">
        {/* Switch back to live container */}
        <HeatmapContainer />
      </main>
    </div>
  );
}

export default App;