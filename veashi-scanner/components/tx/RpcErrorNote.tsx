/** Small inline note shown when a live on-chain check failed and is being retried in the background. */
export default function RpcErrorNote() {
  return (
    <p className="flex items-center gap-1.5 text-xs text-amber-400/80 mt-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      RPC error, retrying…
    </p>
  );
}
