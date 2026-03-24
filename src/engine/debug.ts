export type LogSource = 'MAIN' | 'DATA' | 'RENDER';

export const logInfo = (source: LogSource, message: string, data?: any): void => {
    const prefix = `[${source}]`;
    if (data !== undefined) {
        console.log(`%c${prefix}`, getStyleForSource(source), message, data);
    } else {
        console.log(`%c${prefix}`, getStyleForSource(source), message);
    }
};

export const logError = (source: LogSource, message: string, data?: any): void => {
    const prefix = `[${source}]`;
    if (data !== undefined) {
        console.error(`%c${prefix}`, getStyleForSource(source), message, data);
    } else {
        console.error(`%c${prefix}`, getStyleForSource(source), message);
    }
};

const getStyleForSource = (source: LogSource): string => {
    switch (source) {
        case 'MAIN':
            return 'color: #00ffff; font-weight: bold; background: #002222; padding: 2px 4px; border-radius: 3px;';
        case 'DATA':
            return 'color: #ffaa00; font-weight: bold; background: #332200; padding: 2px 4px; border-radius: 3px;';
        case 'RENDER':
            return 'color: #ff00ff; font-weight: bold; background: #330033; padding: 2px 4px; border-radius: 3px;';
        default:
            return 'font-weight: bold;';
    }
};
