export type AvailableResidentBed = {
  id: string;
  floorName: string;
  roomCode: string;
  bedLabel: string;
  defaultRent: number;
};

export type ResidentRegisterRow = {
  id: string;
  bedId: string;
  fullName: string;
  phone: string;
  alternatePhone: string;
  emergencyName: string;
  emergencyPhone: string;
  address: string;
  floorName: string;
  roomCode: string;
  bedLabel: string;
  moveInDate: string;
  monthlyRent: number;
  depositPromised: number;
  outstanding: number;
  state: "active" | "notice" | "moved_out" | "archived";
  /** Whether this resident can sign in to the resident app. */
  appAccess: "none" | "active" | "disabled";
};

export type ResidentSetupData = {
  residentLimit: number;
  availableBeds: AvailableResidentBed[];
  residents: ResidentRegisterRow[];
  totals: {
    activeResidents: number;
    noticeResidents: number;
    availableBeds: number;
    totalOutstanding: number;
    depositsPromised: number;
  };
};
