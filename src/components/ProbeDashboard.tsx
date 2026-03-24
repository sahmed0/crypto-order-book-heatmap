// Copyright (c) 2026 Sajid Ahmed. All rights reserved.

import { wsReadyStateLabel } from '../ui/utils';

export interface ProbeDashboardProps {
    wsState: number;
    asksSize: number;
    bidsSize: number;
    isSyncing: boolean;
    canvasRes: { w: number; h: number };
    fps: number;
    latency: number;
}

export default function ProbeDashboard(props: ProbeDashboardProps) {
    // ---- Derived FPS colour: green >= 30, yellow > 0, red = 0 -----------
    const fpsColour = () => {
        const f = props.fps;
        if (f >= 30) return '#22c55e';
        if (f > 0) return '#eab308';
        return '#ef4444';
    };

    // ---- Derived Latency colour: green < 50, yellow < 150, red >= 150 -----------
    const latencyColour = () => {
        const l = Math.abs(props.latency);
        if (l < 50) return '#22c55e';
        if (l < 150) return '#eab308';
        return '#ef4444';
    };

    return (
        <div
            aria-label="Liveness probe dashboard"
            style={{
                position: 'relative',
                'pointer-events': 'auto',
                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.85))',
                'backdrop-filter': 'blur(32px) saturate(2)',
                '-webkit-backdrop-filter': 'blur(32px) saturate(2)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                'border-top': '1px solid rgba(255, 255, 255, 0.7)',
                'border-left': '1px solid rgba(255, 255, 255, 0.7)',
                'border-radius': '24px',
                padding: '24px',
                'box-shadow': '0 5px 5px rgba(0, 0, 0, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.2)', 
                'font-family': "'Inter', 'Segoe UI', system-ui, sans-serif",
                'font-size': '11px',
                color: '#1e293b',
                'line-height': '1.8',
                display: 'flex',
                'flex-direction': 'column',
                gap: '6px',
            }}
        >
            <div style={{
                display: 'flex',
                'justify-content': 'space-between',
                'align-items': 'center',
                gap: '16px',
                'margin-bottom': '4px'
            }}>
                <div style={{ 'font-weight': '700', color: '#3b82f6', 'letter-spacing': '0.04em' }}>
                    PROBE DASHBOARD
                </div>
            </div>

            <div>
                Binance WebSocket:{' '}
                <span style={{ color: props.wsState === 1 ? '#22c55e' : '#ef4444', 'font-weight': '600' }}>
                    {wsReadyStateLabel(props.wsState)}
                </span>
            </div>

            <div>Syncing: {props.isSyncing ? 'YES' : 'NO'}</div>

            <div>Total Depth: {props.asksSize + props.bidsSize} levels</div>

            <hr style={{ border: 'none', 'border-top': '1px solid rgba(59,130,246,0.12)', margin: '5px 0' }} />

            <div>
                API Response Latency:{' '}
                <span style={{ color: latencyColour(), 'font-weight': '600' }}>
                    {props.latency !== 0 ? `${Math.abs(props.latency)}ms` : '---'}
                </span>
            </div>

            <div>
                Rendering FPS:{' '}
                <span style={{ color: fpsColour(), 'font-weight': '600' }}>
                    {props.fps}
                </span>
            </div>
        </div>
    );
}
