// Type declarations for marked library
declare global {
    interface Window {
        marked: {
            parse: (text: string) => string;
        };
    }
}

export {};
