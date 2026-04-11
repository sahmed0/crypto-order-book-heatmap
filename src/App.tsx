import HeatmapContainer from "./components/HeatmapContainer";
import { activeSymbol } from './ui/store';
import styles from './App.module.css';

function App() {
  return (
    <div class={styles.appContainer}>
      <header class={styles.header}>
        <h1 class={styles.title}>
          <span class={styles.symbol}>{activeSymbol().replace('USDT', '/USDT')}</span>{' '}
          <span class={styles.titleText}>Binance Order Book Heatmap</span>
        </h1>

        <div class={styles.nav}>
          <a 
            href="https://github.com/sahmed0/crypto-order-book-heatmap.git" 
            target="_blank" 
            rel="noopener noreferrer"
            class={styles.githubLink}
          >
            <svg height="24" width="24" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <div class={styles.divider} />
          <span class={styles.copyright}>
            &copy; 2026 Sajid Ahmed
          </span>
        </div>
      </header>

      <main class={styles.mainContent}>
        {/* Switch back to live container */}
        <HeatmapContainer />
      </main>
    </div>
  );
}

export default App;