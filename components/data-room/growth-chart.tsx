"use client";
import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Metric } from "@/lib/contracts";
export default function GrowthChart({ metrics }: { metrics: Metric[] }) {
  const gradient = useId().replaceAll(":", "");
  const data = [...metrics]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map((x) => ({ ...x, total: x.free + x.paid, label: x.date.slice(5) }));
  return (
    <div
      role="img"
      style={{ height: 230, width: "100%" }}
      aria-label="Registered platform users by date"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 12, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#087681" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#087681" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e8eded" strokeDasharray="3 5" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#5d6c73" }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#5d6c73" }}
          />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dce3e3", fontSize: 12 }} />
          <Area
            type="linear"
            dataKey="total"
            name="Total users"
            stroke="#087681"
            strokeWidth={2}
            fill={`url(#${gradient})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
