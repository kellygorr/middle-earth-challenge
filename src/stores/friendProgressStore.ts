import { create } from 'zustand';

import {
  friendProgressService,
  type FriendProgressParticipant,
} from '../services/friendProgressService';
import { TOTAL_JOURNEY_MILES } from '../constants/gameConstants';

export interface FriendProgressMapParticipant
  extends FriendProgressParticipant {
  markerMessage?: string;
  dismissOnExpandedPress?: boolean;
}

const KELLY_USER_ID = 'local-kelly-easter-egg';

const FAKE_PARTICIPANTS: FriendProgressParticipant[] = [
  {
    userId: 'dev-rosie-copperbutton',
    affinity: 'woodland',
    displayName: 'Rosie Copperbutton',
    distanceMiles: 86,
    updatedAt: new Date(2026, 7, 3, 9, 15).toISOString(),
  },
  {
    userId: 'dev-sam-bramblefoot',
    affinity: 'river',
    displayName: 'Sam Bramblefoot',
    distanceMiles: 241,
    updatedAt: new Date(2026, 7, 3, 10, 30).toISOString(),
  },
  {
    userId: 'dev-merry-applebrook',
    affinity: 'hills',
    displayName: 'Merry Applebrook',
    distanceMiles: 517,
    updatedAt: new Date(2026, 7, 3, 11, 45).toISOString(),
  },
  {
    userId: 'dev-pippin-coastward',
    affinity: 'coast',
    displayName: 'Pippin Coastward',
    distanceMiles: 724,
    updatedAt: new Date(2026, 7, 3, 12, 20).toISOString(),
  },
  {
    userId: 'dev-daisy-hearthside',
    affinity: 'cottage',
    displayName: 'Daisy Hearthside',
    distanceMiles: 931,
    updatedAt: new Date(2026, 7, 3, 13, 5).toISOString(),
  },
];

const withKelly = (
  participants: FriendProgressParticipant[],
  visible: boolean,
): FriendProgressMapParticipant[] => {
  if (!visible || participants.length === 0) return participants;

  const farthestMiles = Math.max(
    ...participants.map(participant => participant.distanceMiles),
  );
  return [
    ...participants,
    {
      userId: KELLY_USER_ID,
      affinity: 'cottage',
      displayName: 'Kelly',
      distanceMiles: Math.min(TOTAL_JOURNEY_MILES, farthestMiles + 50),
      updatedAt: new Date().toISOString(),
      markerMessage: 'Kelly is going to win',
      dismissOnExpandedPress: true,
    },
  ];
};

export interface FriendProgressStore {
  participants: FriendProgressMapParticipant[];
  realParticipants: FriendProgressParticipant[];
  fakeParticipantsEnabled: boolean;
  kellyVisible: boolean;
  isFetching: boolean;
  fetchError: string | null;
  fetchParticipants: () => Promise<void>;
  clearParticipants: () => void;
  showKelly: () => void;
  dismissKelly: () => void;
  setFakeParticipantsEnabled: (enabled: boolean) => void;
}

export const createFriendProgressStore = (
  fetchFriendProgress = friendProgressService.fetchFriendProgress,
) =>
  create<FriendProgressStore>((set, get) => ({
    participants: [],
    realParticipants: [],
    fakeParticipantsEnabled: false,
    kellyVisible: false,
    isFetching: false,
    fetchError: null,
    fetchParticipants: async () => {
      if (get().isFetching) return;

      set({ isFetching: true, fetchError: null });
      try {
        const realParticipants = await fetchFriendProgress();
        set(state => ({
          realParticipants,
          participants: withKelly(
            state.fakeParticipantsEnabled
              ? FAKE_PARTICIPANTS
              : realParticipants,
            state.kellyVisible,
          ),
          isFetching: false,
        }));
      } catch (error) {
        set({
          isFetching: false,
          fetchError:
            error instanceof Error
              ? error.message
              : 'Friend progress could not be loaded',
        });
        throw error;
      }
    },
    clearParticipants: () =>
      set(state => ({
        realParticipants: [],
        participants: state.fakeParticipantsEnabled ? FAKE_PARTICIPANTS : [],
        kellyVisible: false,
        fetchError: null,
      })),
    showKelly: () =>
      set(state => ({
        kellyVisible: true,
        participants: withKelly(
          state.fakeParticipantsEnabled
            ? FAKE_PARTICIPANTS
            : state.realParticipants,
          true,
        ),
      })),
    dismissKelly: () =>
      set(state => ({
        kellyVisible: false,
        participants: state.participants.filter(
          participant => participant.userId !== KELLY_USER_ID,
        ),
      })),
    setFakeParticipantsEnabled: enabled => {
      if (!__DEV__) return;
      set(state => ({
        fakeParticipantsEnabled: enabled,
        kellyVisible: enabled,
        participants: withKelly(
          enabled ? FAKE_PARTICIPANTS : state.realParticipants,
          enabled,
        ),
      }));
    },
  }));

export const useFriendProgressStore = createFriendProgressStore();
