import { For, createMemo, type Accessor } from 'solid-js';

export interface TimeAxisProps {
    latestTimestamp: Accessor<number>;
    timeRangeMs: Accessor<number>;
}

export default function TimeAxis(props: TimeAxisProps) {
    const markers = createMemo(() => {
        const latest = props.latestTimestamp();
        const range = props.timeRangeMs();
        if (!latest || !range) return [{ label: 'Now', left: '100%' }];

        const result = [];
        // Always include "Now"
        result.push({ label: formatTime(latest), left: '100%', align: 'right' });

        // Add 3 more markers at 75%, 50%, 25%
        for (let i = 1; i <= 3; i++) {
            const ratio = 1 - (i * 0.25);
            const ts = latest - (range * (1 - ratio));
            result.push({ 
                label: formatTime(ts), 
                left: `${ratio * 100}%`,
                align: 'center'
            });
        }

        return result;
    });

    function formatTime(ts: number): string {
        const date = new Date(ts);
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        const s = date.getSeconds().toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    return (
        <div style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
        }}>
            <For each={markers()}>
                {(marker: any) => (
                    <div style={{
                        position: 'absolute',
                        left: marker.left,
                        bottom: '0',
                        transform: marker.align === 'right' ? 'translateX(-100%)' : 'translateX(-50%)',
                        display: 'flex',
                        'flex-direction': 'column',
                        'align-items': marker.align === 'right' ? 'flex-end' : 'center',
                    }}>
                        {/* Tick Mark */}
                        <div style={{
                            width: '1px',
                            height: '6px',
                            background: 'rgba(59, 130, 246, 0.3)',
                            'margin-right': marker.align === 'right' ? '2px' : '0',
                        }} />
                        
                        <div style={{
                            'font-size': '10px',
                            'font-weight': 700,
                            color: '#94a3b8',
                            'margin-top': '4px',
                            'white-space': 'nowrap',
                            'font-family': "'Inter', system-ui, sans-serif",
                            opacity: 0.9,
                        }}>
                            {marker.label}
                        </div>
                    </div>
                )}
            </For>
        </div>
    );
}
