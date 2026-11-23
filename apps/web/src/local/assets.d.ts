/** `import path from "./x.woff2" with { type: "file" }`: Bun gives the file's path. */
declare module "*.woff2" {
  const path: string;
  export default path;
}
declare module "*.png" {
  const path: string;
  export default path;
}
declare module "*.svg" {
  const path: string;
  export default path;
}
declare module "*.webmanifest" {
  const path: string;
  export default path;
}
