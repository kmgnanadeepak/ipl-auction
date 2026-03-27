import React from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';

export default function VoiceChatPanel({
  joined,
  muted,
  participants = [],
  onJoin,
  onLeave,
  onToggleMute,
}) {
  return (
    <div className="rounded-2xl bg-gray-900/60 border border-gray-800 p-4">
      <h3 className="text-sm font-bold text-white uppercase tracking-wide mb-3">Voice Chat</h3>
      <div className="flex items-center gap-2 mb-3">
        {!joined ? (
          <button onClick={onJoin} className="px-3 py-2 rounded-lg bg-green-500/15 border border-green-500/40 text-green-300 text-sm flex items-center gap-1.5">
            <Phone className="w-4 h-4" /> Join Channel
          </button>
        ) : (
          <>
            <button onClick={onLeave} className="px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-sm flex items-center gap-1.5">
              <PhoneOff className="w-4 h-4" /> Leave
            </button>
            <button onClick={onToggleMute} className="px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-gray-200 text-sm flex items-center gap-1.5">
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-gray-500">Participants</p>
        {participants.length === 0 ? (
          <p className="text-xs text-gray-600">No active participants</p>
        ) : (
          participants.map((id) => (
            <div key={id} className="text-xs text-gray-300 border border-gray-800 rounded px-2 py-1">{id}</div>
          ))
        )}
      </div>
    </div>
  );
}
