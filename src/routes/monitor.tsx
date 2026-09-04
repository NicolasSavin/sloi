import { createFileRoute } from "@tanstack/react-router";
import { MonitorBooth } from "@/components/monitor/booth";

export const Route = createFileRoute("/monitor")({
  component: MonitorPage,
});

function MonitorPage() {
  return <MonitorBooth />;
}
