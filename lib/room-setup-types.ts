export type BedState = "vacant" | "reserved" | "occupied" | "notice_period" | "maintenance" | "inactive";

export type RoomSetupBed = {
  id: string;
  label: string;
  rentOverride: number | null;
  state: BedState;
};

export type RoomSetupRoom = {
  id: string;
  code: string;
  roomType: "single" | "double" | "triple" | "shared";
  capacity: number;
  defaultRent: number;
  state: "active" | "maintenance" | "inactive";
  beds: RoomSetupBed[];
};

export type RoomSetupFloor = {
  id: string;
  name: string;
  sortOrder: number;
  state: "active" | "inactive";
  rooms: RoomSetupRoom[];
};

export type RoomSetupData = {
  floors: RoomSetupFloor[];
  totals: {
    floors: number;
    rooms: number;
    beds: number;
    vacantBeds: number;
    maintenanceBeds: number;
  };
};
