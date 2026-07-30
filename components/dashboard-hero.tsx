'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

// Taruh 3 foto kamar ini di folder /public/rooms/ pada repo kamu,
// lalu sesuaikan nama file & label di bawah ini.
const rooms = [
  { src: '/rooms/deluxe-twin.jpg', name: 'Deluxe Twin Room' },
  { src: '/rooms/junior-suite.jpg', name: 'Junior Suite' },
  { src: '/rooms/deluxe-king.jpg', name: 'Deluxe King' },
];

interface DashboardHeroProps {
  userName: string;
  onSync?: () => void;
}

export function DashboardHero({ userName, onSync }: DashboardHeroProps) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % rooms.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative h-64 md:h-80 rounded-xl overflow-hidden">
      {rooms.map((room, i) => (
        <div
          key={room.src}
          className={cn(
            'absolute inset-0 transition-opacity duration-1000 ease-in-out',
            i === current ? 'opacity-100' : 'opacity-0'
          )}
        >
          <Image
            src={room.src}
            alt={room.name}
            fill
            priority={i === 0}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/70" />
        </div>
      ))}

      <div className="relative z-10 h-full flex flex-col justify-between p-5 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-semibold text-lg leading-tight">HK Manager</p>
            <p className="text-white/70 text-xs">Horison TC-UPI Serang</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
            onClick={onSync}
          >
            <Download className="mr-2 h-4 w-4" />
            Sync Spreadsheet
          </Button>
        </div>

        <div>
          <span className="inline-block bg-white/90 text-teal-800 text-xs font-semibold px-2.5 py-1 rounded-md mb-2">
            {rooms[current].name}
          </span>
          <h1 className="text-white text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-white/80 text-sm">Welcome back, {userName}</p>
        </div>
      </div>

      <div className="absolute bottom-4 right-5 z-10 flex gap-1.5">
        {rooms.map((room, i) => (
          <button
            key={room.src}
            type="button"
            onClick={() => setCurrent(i)}
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors',
              i === current ? 'bg-white' : 'bg-white/40'
            )}
            aria-label={`Tampilkan ${room.name}`}
          />
        ))}
      </div>
    </div>
  );
}
