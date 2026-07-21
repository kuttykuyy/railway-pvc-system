'use client';

// Extracted so recharts is code-split and loaded on demand (next/dynamic) instead
// of shipping in the tendering-estimator's initial bundle. JSX is unchanged.
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';

export function EscalationAreaChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gBaseline" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gAggressive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gConservative" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="name" stroke="#cbd5e1" fontSize={11} tickLine={false} />
        <YAxis stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
        <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString()}`, '']} labelFormatter={l => `Quarter ${l}`} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Area type="monotone" dataKey="aggressive" name="Aggressive" stroke="#10b981" strokeWidth={2} fill="url(#gAggressive)" />
        <Area type="monotone" dataKey="baseline" name="Baseline" stroke="#10b981" strokeWidth={2} fill="url(#gBaseline)" />
        <Area type="monotone" dataKey="conservative" name="Conservative" stroke="#f59e0b" strokeWidth={2} fill="url(#gConservative)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ComponentPieChart({ data, colors }: { data: Array<{ name: string; value: number }>; colors: string[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} />
      </PieChart>
    </ResponsiveContainer>
  );
}
