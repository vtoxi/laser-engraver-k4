import { useSerialStore } from '../store/serialStore';

export function useJobRunner() {
  const jobRunning = useSerialStore((s) => s.jobRunning);
  const jobProgress = useSerialStore((s) => s.jobProgress);
  const stopJob = useSerialStore((s) => s.stopJob);
  const pauseJob = useSerialStore((s) => s.pauseJob);
  return { jobRunning, jobProgress, stopJob, pauseJob };
}
