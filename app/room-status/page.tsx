'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  Search, RefreshCw, Download, BedDouble, Filter,
} from 'lucide-react';
import {
  HOUSEKEEPING_STATUS_LABELS, HOUSEKEEPING_STATUS_COLORS,
  PRIORITY_LABELS, PRIORITY_COLORS,
  type Room, type Floor, type RoomType, type HousekeepingStatus,
} from '@/lib/types';

export default function RoomStatusPage() {
  const { profile } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [updating, setUpdating] = useState(false);

  const canEdit = profile?.role === 'admin' || profile?.role === 'supervisor' || profile?.role === 'housekeeping';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsRes, floorsRes, typesRes] = await Promise.all([
        supabase.from('rooms').select('*, floor:floors(*), room_type:room_types(*), section:sections(*)').order('number'),
        supabase.from('floors').select('*').order('sort_order'),
        supabase.from('room_types').select('*').order('name'),
      ]);

      setRooms((roomsRes.data as Room[]) || []);
      setFloors((floorsRes.data as Floor[]) || []);
      setRoomTypes((typesRes.data as RoomType[]) || []);
    } catch (err) {
      console.error('Error fetching rooms:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRooms = rooms.filter((r) => {
    const matchSearch = r.number.toLowerCase().includes(search.toLowerCase());
    const matchFloor = floorFilter === 'all' || r.floor_id === floorFilter;
    const matchStatus = statusFilter === 'all' || r.housekeeping_status === statusFilter;
    return matchSearch && matchFloor && matchStatus;
  });

  const groupedByFloor = floors
    .map((floor) => ({
      floor,
      rooms: filteredRooms.filter((r) => r.floor_id === floor.id),
    }))
    .filter((g) => g.rooms.length > 0);

  // ===== UPDATED: handleStatusChange now includes vacant_clean_unchecked =====
  const handleStatusChange = async (room: Room, newStatus: HousekeepingStatus) => {
    setUpdating(true);
    try {
      const updates: Record<string, unknown> = {
        housekeeping_status: newStatus,
        last_cleaned_at: (
          newStatus === 'vacant_clean_unchecked' ||
          newStatus === 'vacant_clean' ||
          newStatus === 'vacant_clean_inspected' ||
          newStatus === 'occupied_clean'
        )
          ? new Date().toISOString()
          : room.last_cleaned_at,
      };
      if (newStatus === 'occupied_clean' || newStatus === 'occupied_dirty' || newStatus === 'expected_departure') updates.occupancy_status = 'occupied';
      if (
        newStatus === 'vacant_dirty' ||
        newStatus === 'vacant_clean_unchecked' ||
        newStatus === 'vacant_clean' ||
        newStatus === 'vacant_clean_inspected'
      ) updates.occupancy_status = 'vacant';

      const { error } = await supabase.from('rooms').update(updates).eq('id', room.id);
      if (error) throw error;

      await fetchData();
      setSelectedRoom(null);
    } catch (err) {
      console.error('Error updating room:', err);
    } finally {
      setUpdating(false);
    }
  };

  // ===== UPDATED: statusCounts now includes vacant_clean_unchecked =====
  const statusCounts: Record<HousekeepingStatus, number> = {
    vacant_dirty: filteredRooms.filter((r) => r.housekeeping_status === 'vacant_dirty').length,
    vacant_clean_unchecked: filteredRooms.filter((r) => r.housekeeping_status === 'vacant_clean_unchecked').length,
    vacant_clean: filteredRooms.filter((r) => r.housekeeping_status === 'vacant_clean').length,
    vacant_clean_inspected: filteredRooms.filter((r) => r.housekeeping_status === 'vacant_clean_inspected').length,
    occupied_clean: filteredRooms.filter((r) => r.housekeeping_status === 'occupied_clean').length,
    occupied_dirty: filteredRooms.filter((r) => r.housekeeping_status === 'occupied_dirty').length,
    expected_departure: filteredRooms.filter((r) => r.housekeeping_status === 'expected_departure').length,
    out_of_order: filteredRooms.filter((r) => r.housekeeping_status === 'out_of_order').length,
    off_market: filteredRooms.filter((r) => r.housekeeping_status === 'off_market').length,
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Room Status"
        description="Real-time room housekeeping status board"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> Sync
            </Button>
          </div>
        }
      />

      {/* Status Summary Bar */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(HOUSEKEEPING_STATUS_LABELS) as HousekeepingStatus[]).map((status) => (
          <Badge
            key={status}
            variant="outline"
            className={cn('px-3 py-1.5 text-xs', HOUSEKEEPING_STATUS_COLORS[status])}
          >
            {HOUSEKEEPING_STATUS_LABELS[status]}: {statusCounts[status]}
          </Badge>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search room number..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={floorFilter} onValueChange={setFloorFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All Floors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Floors</SelectItem>
            {floors.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(Object.keys(HOUSEKEEPING_STATUS_LABELS) as HousekeepingStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{HOUSEKEEPING_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Room Board */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : groupedByFloor.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <BedDouble className="h-10 w-10 mb-2 opacity-40" />
            <p>No rooms found matching your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedByFloor.map(({ floor, rooms: floorRooms }) => (
            <div key={floor.id}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-muted-foreground">{floor.name}</h3>
                <Badge variant="outline" className="text-xs">{floorRooms.length} rooms</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {floorRooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => canEdit && setSelectedRoom(room)}
                    className={cn(
                      'group relative rounded-lg border p-3 text-left transition-all hover:shadow-md hover:-translate-y-0.5',
                      HOUSEKEEPING_STATUS_COLORS[room.housekeeping_status],
                      !canEdit && 'cursor-default'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">{room.number}</span>
                      {room.priority !== 'normal' && (
                        <span className={cn(
                          'h-2 w-2 rounded-full',
                          room.priority === 'urgent' ? 'bg-red-500' :
                          room.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500'
                        )} />
                      )}
                    </div>
                    <p className="text-xs font-medium opacity-80">
                      {HOUSEKEEPING_STATUS_LABELS[room.housekeeping_status]}
                    </p>
                    <p className="text-[10px] opacity-60 mt-0.5">
                      {room.room_type?.code ?? '-'}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {room.occupancy_status === 'occupied' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/10">OCC</span>
                      )}
                      {room.occupancy_status === 'vacant' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/10">VAC</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Room Detail Dialog */}
      <Dialog open={!!selectedRoom} onOpenChange={(open) => !open && setSelectedRoom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Room {selectedRoom?.number}
              <Badge variant="outline" className={cn('text-xs', selectedRoom && HOUSEKEEPING_STATUS_COLORS[selectedRoom.housekeeping_status])}>
                {selectedRoom && HOUSEKEEPING_STATUS_LABELS[selectedRoom.housekeeping_status]}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedRoom?.room_type?.name} - Floor {selectedRoom?.floor?.name}
            </DialogDescription>
          </DialogHeader>

          {selectedRoom && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Occupancy</p>
                  <p className="font-medium capitalize">{selectedRoom.occupancy_status}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Priority</p>
                  <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[selectedRoom.priority])}>
                    {PRIORITY_LABELS[selectedRoom.priority]}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Room Type</p>
                  <p className="font-medium">{selectedRoom.room_type?.name ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Cleaned</p>
                  <p className="font-medium">
                    {selectedRoom.last_cleaned_at
                      ? new Date(selectedRoom.last_cleaned_at).toLocaleString()
                      : 'N/A'}
                  </p>
                </div>
                {selectedRoom.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{selectedRoom.notes}</p>
                  </div>
                )}
              </div>

              {canEdit && (
                <div>
                  <p className="text-sm font-medium mb-2">Update Status</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(HOUSEKEEPING_STATUS_LABELS) as HousekeepingStatus[]).map((status) => (
                      <Button
                        key={status}
                        variant={selectedRoom.housekeeping_status === status ? 'default' : 'outline'}
                        size="sm"
                        disabled={updating}
                        onClick={() => handleStatusChange(selectedRoom, status)}
                        className={cn(
                          'text-xs',
                          selectedRoom.housekeeping_status !== status && HOUSEKEEPING_STATUS_COLORS[status]
                        )}
                      >
                        {HOUSEKEEPING_STATUS_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
