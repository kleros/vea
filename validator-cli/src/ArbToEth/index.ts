import watch from "./watcher";

try {
  watch();
} catch (error) {
  console.log("error", error);
}
