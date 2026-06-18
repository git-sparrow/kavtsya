// Metro inlines EXPO_PUBLIC_* variables at build time. Declare just what we
// read, instead of pulling in @types/node (the wrong environment for RN).
declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
  };
};
