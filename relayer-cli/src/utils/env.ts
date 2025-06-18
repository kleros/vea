export const env = {
  require: (key: string): string => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  },

  optional: (key: string, defaultValue: string): string => {
    return process.env[key] || defaultValue;
  },
};
