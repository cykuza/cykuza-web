'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartData {
 name: string;
 value: number;
}

interface ChartComponentProps {
 data: ChartData[];
 title?: string;
 dataKey?: string;
}

export default function ChartComponent({ data, title, dataKey = 'value' }: ChartComponentProps) {
 return (
  <div className="bg-gray-900 rounded-lg p-6">
   {title && <h3 className="text-lg font-semibold mb-4 text-white">{title}</h3>}
   <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data}>
     <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
     <XAxis dataKey="name" stroke="#9CA3AF" />
     <YAxis stroke="#9CA3AF" />
     <Tooltip
      contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#FFFFFF' }}
     />
     <Line type="monotone" dataKey={dataKey} stroke="#3B82F6" strokeWidth={2} />
    </LineChart>
   </ResponsiveContainer>
  </div>
 );
}












