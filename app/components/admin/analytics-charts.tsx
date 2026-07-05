'use client';

// Extracted so recharts is code-split and loaded on demand (next/dynamic) rather
// than shipping in the admin analytics page's initial bundle. JSX is unchanged.
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export function MonthlyRevenueChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" angle={-45} textAnchor="end" height={80} />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" />
        <Tooltip />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="checks" stroke="#3b82f6" dot={false} strokeWidth={2} name="Total Checks" />
        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#10b981" dot={false} strokeWidth={2} name="Revenue (₹)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeeklyTrendChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" angle={-45} textAnchor="end" height={80} fontSize={12} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="checks" fill="#3b82f6" name="Checks" />
        <Bar dataKey="users" fill="#8b5cf6" name="Unique Users" />
      </BarChart>
    </ResponsiveContainer>
  );
}
