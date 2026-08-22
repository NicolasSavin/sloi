import { createFileRoute } from "@tanstack/react-router";
import { DispatchBoard } from "@/components/dispatch/board";

export const Route = createFileRoute("/dispatch")({
  component: DispatchBoard,
});
