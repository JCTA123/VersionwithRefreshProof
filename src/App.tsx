import { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable?: {
      finalY: number;
    };
  }
}
import './App.css';

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase, ref, onValue, set } from 'firebase/database';
import type { User } from 'firebase/auth';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBtzd0B3fIDJ8XRM1ESKx3klnGZRtVy0Dg',
  authDomain: 'digital-scoresheet-by-jcta.firebaseapp.com',
  projectId: 'digital-scoresheet-by-jcta',
  storageBucket: 'digital-scoresheet-by-jcta.firebasestorage.app',
  messagingSenderId: '911278880062',
  appId: '1:911278880062:web:7ae070f8bdc8e9bbe8686f',
  measurementId: 'G-C31DHJ8EXT',
  databaseURL: 'https://digital-scoresheet-by-jcta-default-rtdb.firebaseio.com',
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app); // ✅ this is what we need
const db = getDatabase(app);
const fs = getFirestore(app);

const DEFAULT_PASSWORD = 'JCTA123';

const auth = getAuth(app);

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [organizerView, setOrganizerView] = useState(false);
  const [currentJudge, setCurrentJudge] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [viewMode, setViewMode] = useState<'intro' | 'judge' | 'organizer'>(
    'intro'
  );
  const [user, setUser] = useState<User | null>(null);
  const updateFirebase = (key: string, data: any) => {
    if (!user) {
      console.warn('❌ No user. Skipping updateFirebase.');
      return;
    }
    set(ref(db, `users/${user.uid}/${key}`), data)
      .then(() => {
        console.log(`✅ Updated Firebase key: ${key}`);
      })
      .catch((err) => {
        console.error('❌ Firebase write failed:', err);
      });
  };

  const [orgPasswordInput, setOrgPasswordInput] = useState('');
  const [organizerPassword, setOrganizerPassword] = useState(DEFAULT_PASSWORD);
  const [pendingJudgeName, setPendingJudgeName] = useState('');
  const [judgeCodes, setJudgeCodes] = useState<string[]>([]);
  const [codeInput, setCodeInput] = useState('');

  const [authChecked, setAuthChecked] = useState(false);
  const [requireFreshLogin, setRequireFreshLogin] = useState(() => {
    const saved = localStorage.getItem('requireFreshLogin');
    return saved === 'false' ? false : true;
  });
  const [tempScores, setTempScores] = useState<{
    [eventIdx: string]: {
      [participant: string]: {
        [criterion: string]: string | number;
      };
    };
  }>({});
    const [twoPhaseVisibility, setTwoPhaseVisibility] = useState<{
    [baseName: string]: boolean;
  }>(() => {
    const saved = localStorage.getItem('twoPhaseVisibility');
    return saved ? JSON.parse(saved) : {};
  });
  // Stores weights per event group (default 60-40 if not set)
  const [weights, setWeights] = useState<{ [key: string]: { phase1: number; phase2: number } }>({});
  useEffect(() => {
    localStorage.setItem('twoPhaseVisibility', JSON.stringify(twoPhaseVisibility));
  }, [twoPhaseVisibility]);
  interface DisabledWrapper {
    frozen: boolean;
    children: React.ReactNode; // ✅ now TS knows it accepts children
  };
  
  type Event = {
    name: string;
    participants: string[];
    judges: string[];
    judgeWeights: { [key: string]: number };
    criteria: { name: string; max: number }[];
    scores: { [judge: string]: { [participant: string]: { [criterion: string]: number } } };
    visibleToJudges: boolean;
    resultsVisibleToJudges: boolean;
    isTwoPhased?: boolean;
    phaseCategory?: string;
    phaseWeights?: { phase1: number; phase2: number };
    submittedJudges?: string[];
  };
  type ChatMessage = {
    sender: string;
    text: string;
  };
  
  useEffect(() => {
    console.log('✅ viewMode:', viewMode);
    console.log('✅ organizerView:', organizerView);
  }, [viewMode, organizerView]);

  useEffect(() => {
    if (!user) return;

    const base = `users/${user.uid}/`;

    const eventsRef = ref(db, base + 'events');
    const chatMessagesRef = ref(db, base + 'chatMessages');
    const codesRef = ref(db, base + 'judgeCodes');
    const passRef = ref(db, base + 'organizerPassword');

    onValue(eventsRef, (snapshot) => {
      setEvents(snapshot.val() || []);
    });

    onValue(chatMessagesRef, (snapshot) => {
      setChatMessages(snapshot.val() || []);
    });

    onValue(codesRef, (snapshot) => {
      const val = snapshot.val();
      const codeList = val ? Object.values(val) : [];
      setJudgeCodes(codeList as string[]);
    });

    onValue(passRef, (snapshot) => {
      setOrganizerPassword(snapshot.val() || DEFAULT_PASSWORD);
    });
  }, [user]); // 👈 Make sure to re-run when user changes
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser); // ✅ now setUser is used
        setAuthChecked(true);  // ✅ now setAuthChecked is used
      } else {
        setUser(null);
        setAuthChecked(true);
      }
    });
  
    return () => unsubscribe();
  }, []);
  
// === Listen for config from Firestore ===
useEffect(() => {
  const unsub = onSnapshot(doc(firestore, "appConfig", "meta"), (docSnap) => {
    const data = docSnap.data();
    if (!data) return;

    if (data.twoPhaseVisibility) {
      setTwoPhaseVisibility(data.twoPhaseVisibility);
    }
    if (data.weights) {
      setWeights(data.weights); // load directly from Firestore
    }
  });

  return () => unsub();
}, []); // no [events] here, or it will reset on every event change!

// === Persist twoPhaseVisibility to Firestore ===
useEffect(() => {
  if (Object.keys(twoPhaseVisibility).length > 0) {
    setDoc(
      doc(firestore, "appConfig", "meta"),
      { twoPhaseVisibility },
      { merge: true }
    );
  }
}, [twoPhaseVisibility]);
// === Persist weights to Firebase whenever they change ===
useEffect(() => {
  if (Object.keys(weights).length > 0) {
    setDoc(
      doc(firestore, "appConfig", "meta"),
      { weights },
      { merge: true }
    );
  }
}, [weights]);

// === Persist weights to Firestore ===
useEffect(() => {
  if (Object.keys(weights).length > 0) {
    setDoc(
      doc(firestore, "appConfig", "meta"),
      { weights },
      { merge: true }
    );
  }
}, [weights]);

// 🧠 2. Restore view after auth is confirmed
useEffect(() => {
  if (!authChecked || !user) return;

  const savedView = localStorage.getItem('viewMode');
  const savedJudge = localStorage.getItem('currentJudge');
  const savedOrganizer = localStorage.getItem('organizerView');

  if (savedView) setViewMode(savedView as 'intro' | 'judge' | 'organizer');
  if (savedJudge) setCurrentJudge(savedJudge);
  if (savedOrganizer === 'true') setOrganizerView(true);
}, [authChecked, user]);

const [frozen, setFrozen] = useState(false);

// Firebase reference
const frozenDocRef = user ? doc(fs, "users", user.uid, "settings", "freeze") : null;

// Listen for real-time updates
useEffect(() => {
  if (!frozenDocRef) return;

  const unsubscribe = onSnapshot(frozenDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      setFrozen(data?.frozen ?? false);
    }
  });

  return () => unsubscribe();
}, [frozenDocRef]);

const handleFreeze = async () => {
  if (!user || !frozenDocRef) return;

  const input = prompt(
    frozen
      ? "Enter organizer password to unfreeze:"
      : "Enter organizer password to freeze:"
  );

  if (input === organizerPassword) {
    try {
      await setDoc(frozenDocRef, { frozen: !frozen }, { merge: true });
      alert(!frozen ? "Frozen ❄️" : "Unfrozen ✅");
    } catch (err) {
      console.error(err);
      alert("Error updating frozen state!");
    }
  } else {
    alert("Incorrect password!");
  }
};

const createNewEvent = () => {
  const name = prompt('Enter event name:');
  if (!name) return;
  const newEvents = [
    ...events,
    {
      name,
      participants: ['Alice', 'Bob'],
      judges: ['Judge 1'],
      judgeWeights: { 'Judge 1': 100 },
      criteria: [{ name: 'Creativity', max: 10 }],
      scores: {},
      visibleToJudges: false,
      resultsVisibleToJudges: false,
      phaseWeights: { phase1: 60, phase2: 40 }, // ✅ always default
    },
  ];
  updateFirebase('events', newEvents);
  setEvents(newEvents);
};

  const deleteEvent = (idx: number) => {
    if (window.confirm('Are you sure you want to delete this event?')) {
      const copy = [...events];
      copy.splice(idx, 1);
      updateFirebase('events', copy);
    }
  };

  const updateEvent = (idx: number, newEv: Event) => {
    const copy = [...events];
    copy[idx] = newEv;
    updateFirebase('events', copy);
    setEvents(copy); // You likely need this line too to update the UI
  };

const updateWeights = async (
  baseName: string,
  newWeights: { phase1: number; phase2: number }
) => {
  const updated = { ...weights, [baseName]: newWeights };
  setWeights(updated);

  await setDoc(doc(firestore, 'appConfig', 'meta'), { weights: updated }, { merge: true });

  // Also update each event so UI shows immediately
  const idxPhase1 = events.findIndex(
    (e) => e.name === baseName && e.phaseCategory === 'Phase 1'
  );
  const idxPhase2 = events.findIndex(
    (e) => e.name === baseName && e.phaseCategory === 'Phase 2'
  );

  if (idxPhase1 !== -1)
    updateEvent(idxPhase1, { ...events[idxPhase1], phaseWeights: newWeights });
  if (idxPhase2 !== -1)
    updateEvent(idxPhase2, { ...events[idxPhase2], phaseWeights: newWeights });
};
// === Save Weights handler ===
const saveWeights = async (baseName: string, phaseWeights: { phase1: number; phase2: number }) => {
  try {
    await setDoc(
      doc(fs, "appConfig", "meta"),
      { weights: { [baseName]: phaseWeights } },
      { merge: true }
    );
    alert("✅ Weights saved successfully!");
  } catch (err: any) {
    console.error("Error saving weights:", err);
    alert("❌ Failed to save weights: " + (err.message || err));
  }
  };
  const toggleVisibility = (idx: number) => {
    const ev = events[idx];
    const updated = { ...ev, visibleToJudges: !ev.visibleToJudges };
    const updatedEvents = [...events];
    updatedEvents[idx] = updated;
    updateFirebase('events', updatedEvents);
    setEvents(updatedEvents); // ensure UI reflects change immediately
  };

  const toggleResultsVisibility = (idx: number) => {
    const ev = events[idx];
    const updated = {
      ...ev,
      resultsVisibleToJudges: !ev.resultsVisibleToJudges,
    };
    const updatedEvents = [...events];
    updatedEvents[idx] = updated;
    updateFirebase('events', updatedEvents);
    setEvents(updatedEvents);
  };
  
  const toggleTwoPhaseVisibility = async (baseName: string) => {
    const newState = {
      ...twoPhaseVisibility,
      [baseName]: !twoPhaseVisibility[baseName],
    };
  
    setTwoPhaseVisibility(newState); // local UI update
    await updateDoc(doc(firestore, 'appConfig', 'meta'), {
      twoPhaseVisibility: newState, // sync to Firebase
    });
  };
      
  const handleInputScore = (
    idx: number,
    judge: string,
    participant: string,
    crit: string,
    val: string | number
  ): void => {
    const ev = events[idx];
  
    // Convert and sanitize input
    const parsedVal = Number(val);
    if (isNaN(parsedVal)) return; // Skip if not a valid number
  
    const newScores = {
      ...ev.scores,
      [judge]: {
        ...(ev.scores[judge] || {}),
        [participant]: {
          ...(ev.scores[judge]?.[participant] || {}),
          [crit]: parsedVal, // ✅ Always a number now
        },
      },
    };
  
    updateEvent(idx, { ...ev, scores: newScores });
  };
    
  const handleSubmitScores = (idx: number) => {
    const ev = events[idx];
    const updatedSubmitted = [...(ev.submittedJudges || []), currentJudge];
  
    const scoresToPush: {
      [judge: string]: {
        [participant: string]: {
          [criterion: string]: number;
        };
      };
    } = { ...ev.scores };
  
    const temp = tempScores?.[idx.toString()] || {}; // 🔧 Cast index to string if needed
  
    Object.keys(temp).forEach((participant) => {
      const participantScores = temp[participant];
      Object.keys(participantScores).forEach((crit) => {
        const raw = participantScores[crit];
        const parsed = Number(raw);
  
        if (!scoresToPush[currentJudge]) scoresToPush[currentJudge] = {};
        if (!scoresToPush[currentJudge][participant])
          scoresToPush[currentJudge][participant] = {};
  
        scoresToPush[currentJudge][participant][crit] = isNaN(parsed)
          ? 0
          : parsed; // ✅ Ensure value is a number
      });
    });
  
    const updatedEvent: Event = {
      ...ev,
      scores: scoresToPush,
      submittedJudges: updatedSubmitted,
    };
  
    updateEvent(idx, updatedEvent);
  };
  
  const handleSendMessage = () => {
    if (newMessage.trim()) {
      const updatedMessages = [
        ...chatMessages,
        {
          sender: organizerView ? 'Organizer' : currentJudge,
          text: newMessage.trim(),
        },
      ];
      updateFirebase('chatMessages', updatedMessages);
      setNewMessage('');
    }
  };

  const generateJudgeCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const updatedCodes = [...judgeCodes, code];

    // Convert to object for Firebase
    const codeObj = updatedCodes.reduce((acc, val, idx) => {
      acc[idx] = val;
      return acc;
    }, {} as Record<string, string>);

    updateFirebase('judgeCodes', codeObj);
    setJudgeCodes(updatedCodes); // ✅ Also update UI
    alert('New Judge Code: ' + code);
  };

  const changeOrganizerPassword = () => {
    const newPass = prompt('Enter new password:');
    if (newPass && newPass.length >= 4) {
      updateFirebase('organizerPassword', newPass);
      alert('Password updated.');
    }
  };

  const handleJudgeLogin = () => {
    if (!judgeCodes.includes(codeInput.trim())) {
      alert('Invalid code');
      return;
    }
    if (!pendingJudgeName.trim()) {
      alert('Please enter a name.');
      return;
    }

    const updatedEvents = events.map((ev) => {
      if (!ev.judges.includes(pendingJudgeName)) {
        return { ...ev, judges: [...ev.judges, pendingJudgeName] };
      }
      return ev;
    });

    updateFirebase('events', updatedEvents);
    localStorage.setItem('viewMode', 'judge');
    localStorage.setItem('currentJudge', pendingJudgeName);
    setCurrentJudge(pendingJudgeName);
    setViewMode('judge');
  };

  const handleOrganizerLogin = () => {
    if (orgPasswordInput === organizerPassword) {
      localStorage.setItem('viewMode', 'organizer');
      localStorage.setItem('organizerView', 'true');
      setOrganizerView(true);
      setViewMode('organizer');
    } else {
      alert('Incorrect password');
    }
  };

  const handleImport = () => {
    if (!user) return;
    const input = prompt('Paste your exported JSON here:');
    if (input) {
      try {
        const parsed = JSON.parse(input);
        updateFirebase('events', parsed.events || []);
        updateFirebase('chatMessages', parsed.chatMessages || []);
        updateFirebase('judgeCodes', parsed.judgeCodes || []);
        updateFirebase(
          'organizerPassword',
          parsed.organizerPassword || DEFAULT_PASSWORD
        );
        alert('Data imported and synced to Firebase.');
      } catch {
        alert('Invalid data.');
      }
    }
  };

  const handleExportSelection = (type: string) => {
    if (!user) return;
  
    const exportData = {
      events,
      chatMessages,
      judgeCodes,
      organizerPassword,
    };
  
    switch (type) {
      case 'json':
        navigator.clipboard.writeText(JSON.stringify(exportData));
        alert('Data copied to clipboard.');
        break;
  
      case 'overallSummary':
        exportOverallSummaryPDF(); // Assumes this function already uses relevant data
        break;
  
      case 'perJudge':
        exportPerJudgePDF(); // Assumes per-judge logic is already inside
        break;
  
      case 'specificEvent':
        exportSpecificEventPDF(); // Assumes you handle event selection internally
        break;
  
      case 'finalSummary':
        exportFinalSummaryPDF("Final Event", {
          "Participant A": 90.25,
          "Participant B": 88.5
        }, {
          phase1: 60,
          phase2: 40
        });
        break;
  
      case 'combined':
        exportCombinedPDF("Combined Event", [
          ["Participant A", 90.25],
          ["Participant B", 88.5]
        ], {
          phase1: 60,
          phase2: 40
        });
        break;
  
      default:
        break;
    }
  };
    
  const handleAuthLogout = () => {
    signOut(auth).then(() => {
      alert('👋 Signed out');
      localStorage.clear();
      setOrganizerView(false);
      setCurrentJudge('');
      setViewMode('intro');
      setEvents([]);
      setJudgeCodes([]);
      setChatMessages([]);
      localStorage.setItem('requireFreshLogin', 'true');
      setRequireFreshLogin(true); // 👈 Add this
    });
  };

  const refreshAllData = () => {
    if (!user) return;

    const base = `users/${user.uid}/`;

    onValue(
      ref(db, base + 'events'),
      (snapshot) => {
        setEvents(snapshot.val() || []);
      },
      { onlyOnce: true }
    );

    onValue(
      ref(db, base + 'chatMessages'),
      (snapshot) => {
        setChatMessages(snapshot.val() || []);
      },
      { onlyOnce: true }
    );

    onValue(
      ref(db, base + 'judgeCodes'),
      (snapshot) => {
        const val = snapshot.val();
        const codeList = val ? Object.values(val as { [key: string]: string }) : [];
        setJudgeCodes(codeList);
      },
      { onlyOnce: true }
    );
    
    onValue(
      ref(db, base + 'organizerPassword'),
      (snapshot) => {
        setOrganizerPassword(snapshot.val() || DEFAULT_PASSWORD);
      },
      { onlyOnce: true }
    );

    alert('✅ Data refreshed from Firebase.');
  };
  const DisabledWrapper: React.FC<DisabledWrapper> = ({ frozen, children }) => {
    return (
      <div
        style={{
          pointerEvents: frozen ? "none" : "auto",
          opacity: frozen ? 0.5 : 1,
        }}
      >
        {children}
      </div>
    );
  };
  const calcTotalForJudge = (
    ev: Event,
    judge: string,
    participant: string
  ): number => {
    const scores = ev.scores?.[judge]?.[participant] || {};
    return Object.values(scores).reduce((a: number, b: number) => a + Number(b || 0), 0);
  };

  const calcTotalAllJudges = (ev: Event, participant: string): number => {
    return ev.judges.reduce((sum: number, judge: string) => {
      return sum + calcTotalForJudge(ev, judge, participant);
    }, 0);
  };
  const calcAvg = (ev: Event, participant: string): string => {
    const totalWeight = Object.values(ev.judgeWeights || {}).reduce(
      (sum: number, w: number) => sum + w,
      0
    );
  
    if (totalWeight === 0) return '0.00';
  
    const weightedSum = ev.judges.reduce((sum: number, judge: string) => {
      const judgeScore = calcTotalForJudge(ev, judge, participant);
      const weight = ev.judgeWeights?.[judge] || 0;
      return sum + (judgeScore * weight) / 100;
    }, 0);
  
    return weightedSum.toFixed(2);
  };
    
  type RankedParticipant = {
    name: string;
    avg: number;
  };
  const getTwoPhaseGroups = () => {
    const grouped: { [key: string]: { phase1?: Event; phase2?: Event } } = {};
  
    events.forEach((e) => {
      if (e.phaseCategory) {
        const baseName = e.name.replace(/ - Phase [12]$/, "");
        if (!grouped[baseName]) grouped[baseName] = {};
        if (e.phaseCategory === "Phase 1") grouped[baseName].phase1 = e;
        if (e.phaseCategory === "Phase 2") grouped[baseName].phase2 = e;
      }
    });
  
    return Object.entries(grouped).map(([baseName, { phase1, phase2 }]) => {
      const saved = weights[baseName]; // ← from Firestore
      const phaseWeights = saved || phase1?.phaseWeights || { phase1: 60, phase2: 40 };
  
      return { baseName, phase1, phase2, phaseWeights };
    });
  };
  
  const renderSummary = (ev: Event) => {
    const ranked: RankedParticipant[] = ev.participants
      .map((p: string) => ({
        name: p,
        avg: Number(calcAvg(ev, p)),
      }))
      .sort((a: RankedParticipant, b: RankedParticipant) => b.avg - a.avg);
    const getEmoji = (idx: number) => {
      if (idx === 0) return '🥇';
      if (idx === 1) return '🥈';
      if (idx === 2) return '🥉';
      return '';
    };

    return (
      <div className="summary-box">
        <h3>🏅 Rankings (Average of All Judges)</h3>
        <table className="majestic-ranking-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Participant</th>
              <th>Average Score</th>
            </tr>
          </thead>
          <tbody>
          {ranked.map((r: { name: string; avg: number }, idx: number) => (
  <tr key={idx} className={`rank-${idx + 1}`}>
    <td>
      <span className="rank-emoji">{getEmoji(idx)}</span>
      {idx + 1}
    </td>
    <td>{r.name}</td>
    <td>{r.avg.toFixed(2)}</td>
  </tr>
             ))}
          </tbody>
        </table>
      </div>
    );
  };

  const exportOverallSummaryPDF = () => {
    const doc = new jsPDF();
    const margin = 14;
    const spacing = 10;

    doc.setFontSize(16);
    doc.setTextColor('#3c3c3c');
    doc.setFont('helvetica', 'bold');
    doc.text('🏆 Overall Rankings (Averaged by All Judges)', margin, 20);

    let currentY = 30;

    events.forEach((ev) => {
      const ranked = ev.participants
        .map((p) => ({
          name: p,
          avg: Number(calcAvg(ev, p)),
        }))
        .sort((a, b) => b.avg - a.avg);

        doc.autoTable({
        startY: currentY,
        theme: 'grid',
        head: [[`🎯 ${ev.name}`, 'Average']],
        body: ranked.map((r, i) => [`${i + 1}. ${r.name}`, r.avg.toFixed(2)]),
        headStyles: {
          fillColor: [63, 81, 181], // Indigo
          textColor: [255, 255, 255],
          halign: 'center',
          fontSize: 12,
        },
        bodyStyles: {
          fillColor: [240, 248, 255], // AliceBlue
          textColor: [60, 60, 60],
          fontSize: 11,
        },
        columnStyles: {
          0: { cellPadding: 5, halign: 'left' },
          1: { halign: 'center' },
        },
        styles: {
          cellPadding: 6,
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
        },
      });

      currentY = (doc.lastAutoTable?.finalY || currentY) + spacing;
    });

    doc.save('overall_summary.pdf');
  };
  const exportFinalSummaryPDF = (
    eventName: string,
    scores: { [participant: string]: number },
    weights: { phase1: number; phase2: number }
  ) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${eventName} – Final Combined Results`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Weighting: Phase 1 = ${weights.phase1}% | Phase 2 = ${weights.phase2}%`, 14, 30);
  
    const data = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([name, score], i) => [i + 1, name, score.toFixed(2)]);
  
    (doc as any).autoTable({
      head: [['Rank', 'Participant', 'Final Score']],
      body: data,
      startY: 40,
    });
  
    doc.save(`${eventName}_Final_Summary.pdf`);
  };
  
  const exportPerJudgePDF = () => {
    const doc = new jsPDF();
    const margin = 14;
    let currentY = 20;

    doc.setFontSize(16);
    doc.setTextColor('#2c2c2c');
    doc.setFont('helvetica', 'bold');
    doc.text('👨‍⚖️ Per-Judge Scoring Summary', margin, currentY);
    currentY += 10;

    events.forEach((ev) => {
      ev.judges.forEach((j) => {
        doc.autoTable({
          startY: currentY,
          theme: 'grid',
          head: [[`🎯 ${ev.name}`, `Judge: ${j}`]],
          body: ev.participants.map((p) => [
            p,
            calcTotalForJudge(ev, j, p).toFixed(2),
          ]),
          headStyles: {
            fillColor: [0, 150, 136], // Teal
            textColor: [255, 255, 255],
            fontSize: 12,
            halign: 'center',
          },
          bodyStyles: {
            fillColor: [250, 250, 250],
            textColor: [40, 40, 40],
            fontSize: 11,
          },
          columnStyles: {
            0: { cellPadding: 5, halign: 'left' },
            1: { halign: 'center' },
          },
          styles: {
            lineWidth: 0.1,
            lineColor: [200, 200, 200],
            cellPadding: 5,
          },
        });

        currentY = (doc.lastAutoTable?.finalY || currentY) + 10;
      });
    });

    doc.save('per_judge_results.pdf');
  };
  const exportCombinedPDF = (
    baseName: string,
    ranked: [string, number][],
    weights: { phase1: number; phase2: number }
  ) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${baseName} - Final Combined Summary`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Phase 1: ${weights.phase1}%`, 14, 30);
    doc.text(`Phase 2: ${weights.phase2}%`, 14, 38);
  
    const rows = ranked.map(([name, score], idx) => [
      idx + 1,
      name,
      score.toFixed(2),
    ]);
  
    (doc as any).autoTable({
      startY: 45,
      head: [['Rank', 'Participant', 'Final Score']],
      body: rows,
    });
  
    // Optional watermark
    doc.setFontSize(8);
    doc.setTextColor(180);
    doc.text(
      'JOHN CARL TABANAO ALCORIN 265311',
      14,
      doc.internal.pageSize.height - 10
    );
  
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url);
  };
  
  const exportSpecificEventPDF = () => {
    const evName = prompt('Enter exact event name:');
    const ev = events.find((e) => e.name === evName);
    if (!ev) {
      alert('Event not found.');
      return;
    }

    const doc = new jsPDF();
    let currentY = 20;

    doc.setFontSize(16);
    doc.setTextColor('#333');
    doc.setFont('helvetica', 'bold');
    doc.text(`📋 ${ev.name} – Complete Scoring Summary`, 14, currentY);
    currentY += 10;

    doc.autoTable({
      startY: currentY,
      theme: 'grid',
      head: [
        ['Participant', ...ev.judges.map((j) => `👨‍⚖️ ${j}`), 'Total', 'Average'],
      ],
      body: ev.participants.map((p) => [
        p,
        ...ev.judges.map((j) => calcTotalForJudge(ev, j, p).toFixed(2)),
        calcTotalAllJudges(ev, p).toFixed(2),
        calcAvg(ev, p),
      ]),
      headStyles: {
        fillColor: [63, 81, 181], // Indigo
        textColor: [255, 255, 255],
        fontSize: 12,
      },
      bodyStyles: {
        fillColor: [245, 245, 255],
        textColor: [30, 30, 30],
        fontSize: 11,
      },
      styles: {
        cellPadding: 5,
        lineWidth: 0.1,
        lineColor: [220, 220, 220],
      },
    });

    currentY = (doc.lastAutoTable?.finalY || currentY) + 10;

    const ranked = ev.participants
      .map((p) => ({
        name: p,
        avg: Number(calcAvg(ev, p)),
      }))
      .sort((a, b) => b.avg - a.avg);

      doc.autoTable({
      startY: currentY,
      head: [['🏅 Final Rankings (Averaged)']],
      body: ranked.map((r, idx) => [
        `${idx + 1}. ${r.name} — ${r.avg.toFixed(2)}`,
      ]),
      headStyles: {
        fillColor: [255, 87, 34], // Deep orange
        textColor: [255, 255, 255],
        fontSize: 12,
      },
      bodyStyles: {
        fillColor: [255, 243, 224],
        textColor: [40, 40, 40],
        fontSize: 11,
      },
      styles: {
        cellPadding: 5,
        lineWidth: 0.1,
        lineColor: [210, 210, 210],
      },
    });

    doc.save(`${ev.name.replace(/\s+/g, '_')}_summary.pdf`);
  };

  const loginWithEmail = async () => {
    const email = prompt('Enter email:');
    const password = prompt('Enter password:');
  
    if (!email || !password) {
      alert('❌ Email and password are required');
      return;
    }
  
    try {
      await signInWithEmailAndPassword(auth, email, password);
      alert('✅ Logged in successfully.');
      localStorage.setItem('requireFreshLogin', 'false');
      setRequireFreshLogin(false);
      setViewMode('intro');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert('❌ Login failed: ' + message);
    }
  };
  
  const registerWithEmail = async () => {
    const email = prompt('Enter new email:');
    const password = prompt('Enter new password (min 6 chars):');
  
    if (!email || !password) {
      alert('❌ Email and password are required.');
      return;
    }
  
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("✅ Registered successfully. You're now logged in.");
      localStorage.setItem('requireFreshLogin', 'false');
      setRequireFreshLogin(false);
      setViewMode('intro');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert('❌ Registration failed: ' + message);
    }
  };
  
  if (!authChecked) {
    return (
      <div className="intro-screen">
        <h1>🎯 Digital Scoresheet App</h1>
        <p className="text-center credits">made by JCTA</p>
        <div className="flex-center">
          <p>⏳ Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!user || requireFreshLogin) {
    return (
      <div className="intro-screen">
        <h1>🎯 Digital Scoresheet</h1>
        <p className="text-center credits">made by JCTA</p>
        <div className="flex-center">
          <button className="btn-purple" onClick={loginWithEmail}>
            🔐 Login with Email
          </button>
          <button className="btn-yellow" onClick={registerWithEmail}>
            🆕 Register New Account
          </button>
        </div>
      </div>
    );
  }

// 👇 Organizer Password Prompt
if (viewMode === 'organizer' && !organizerView) {
  return (
    <div className="intro-screen">
      <h2>🔒 Organizer Log-in</h2>
      <input
        type="password"
        value={orgPasswordInput}
        onChange={(e) => setOrgPasswordInput(e.target.value)}
        placeholder="Enter organizer password (Default: JCTA123)"
      />
      <br />
      <button className="btn-blue" onClick={handleOrganizerLogin}>
        Submit
      </button>
      <button className="btn-gray" onClick={() => setViewMode('intro')}>
        🔙 Back
      </button>
    </div>
  );
}

// 👇 Initial Intro Screen
if (viewMode === 'intro') {
  return (
    <div className="intro-screen">
      <h1>🎯 Digital Scoresheet</h1>
      <p className="text-center credits">made by JCTA</p>
      <div className="flex-center">
        <button className="btn-blue" onClick={() => setViewMode('judge')}>
          Login as Judge
        </button>
        <button
          className="btn-green"
          onClick={() => {
            setOrganizerView(false); // ✅ Force password screen to appear
            setViewMode('organizer');
          }}
        >
          Login as Organizer
        </button>
      </div>
    </div>
  );
}

// 👇 Judge login screen
if (viewMode === 'judge' && !currentJudge) {
  return (
    <div className="intro-screen">
      <h2>Judge Log-in</h2>
      <input
        placeholder="Enter code"
        value={codeInput}
        onChange={(e) => setCodeInput(e.target.value)}
      />
      <input
        placeholder="Enter your name"
        value={pendingJudgeName}
        onChange={(e) => setPendingJudgeName(e.target.value)}
      />
      <br />
      <button className="btn-green" onClick={handleJudgeLogin}>
        Login
      </button>
      <button className="btn-gray" onClick={() => setViewMode('intro')}>
        🔙 Back
      </button>
    </div>
  );
}
  const promptEditList = (
    title: string,
    list: string[],
    callback: (newList: string[]) => void
  ): void => {
    const input = prompt(`${title} (comma separated):`, list.join(', '));
    if (input != null) {
      const newList = input
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      callback(newList);
    }
  };
  const visibleJudgeEvents = events.filter(
    (ev) =>
      ev.visibleToJudges &&
      ev.judges
        .map((j) => j.toLowerCase())
        .includes(currentJudge.trim().toLowerCase())
  );
  return (
  <>
  <DisabledWrapper frozen={frozen}>
    <div className="app-container">
      {viewMode === 'organizer' && organizerView ? (
        <>
          <div className="top-bar">
            <h1>🎯 Digital Scoresheet</h1>
            <p className="text-center credits">made by JCTA</p>
            <div className="flex-center">
              <button className="btn-green" onClick={createNewEvent}>
                ➕ Add Event
              </button>
              <button className="btn-purple" onClick={handleImport}>
                📥 Import
              </button><div className="dropdown">
  <button className="btn-purple">📤 Export ▼</button>
  <div className="dropdown-content">
    <button onClick={() => handleExportSelection('json')}>
      📋 Export All JSON
    </button>
    <button onClick={() => handleExportSelection('overallSummary')}>
      📊 Overall Summary PDF
    </button>
    <button onClick={() => handleExportSelection('perJudge')}>
      👨‍⚖️ Per-Judge Results PDF
    </button>
    <button onClick={() => handleExportSelection('specificEvent')}>
      📄 Specific Event PDF
    </button>
    <button onClick={() => handleExportSelection('finalSummary')}>
      🏁 Final Combined Summary PDF
    </button>
    <button onClick={() => handleExportSelection('combined')}>
      ⚖️ Two-Phase Combined PDF
    </button>
  </div>
</div>
              <button className="btn-yellow" onClick={generateJudgeCode}>
                🎫 Generate Judge Code
              </button>
              <button className="btn-blue" onClick={changeOrganizerPassword}>
                🔐 Change Password
              </button>
              <button className="btn-gray" onClick={refreshAllData}>
                🔄 Refresh
              </button>
              <button
                className="btn-gray"
                onClick={() => {
                  setOrganizerView(false);
                  setViewMode('judge');
                }}
              >
                👨‍⚖️ Switch to Judge View
              </button>
            </div>

            <div className="card">
              <h3>🎟️ Active Judge Codes:</h3>
              <ul>
                {judgeCodes.length === 0 ? (
                  <li>No codes yet</li>
                ) : (
                  judgeCodes.map((code, i) => <li key={i}>{code}</li>)
                )}
              </ul>
            </div>
          </div>
            {/* === Inside Organizer View (where you already have Import/Export/Show Summary) === */}

<div className="two-phase-controls"style={{ display: 'none' }}>
  <h3></h3>

  {Object.keys(weights).map((baseName) => (
    <div key={baseName} className="two-phase-item">
      <h4>{baseName}</h4>

      {/* Phase Weights */}
      <label>
        Phase 1 (%):{" "}
        <input
          type="number"
          min={0}
          max={100}
          value={weights[baseName]?.phase1 || 60}
          onChange={(e) =>
            updateWeights(baseName, {
              phase1: Number(e.target.value),
              phase2: 100 - Number(e.target.value),
            })
          }
        />
      </label>
      <span>Phase 2 (%): {weights[baseName]?.phase2 || 40}</span>

      {/* Visibility Toggle */}
      <button
        onClick={() => toggleTwoPhaseVisibility(baseName)}
        className="toggle-btn"
      >
        {twoPhaseVisibility[baseName]
          ? "Hide Combined Summary from Judges"
          : "Show Combined Summary to Judges"}
      </button>
    </div>
  ))}
</div>

          <h2></h2>
          {getTwoPhaseGroups()
  .filter((group) => viewMode === 'organizer' || twoPhaseVisibility[group.baseName])
  .map((group, idx) => {
    const { baseName, phase1, phase2 } = group;
    if (!phase1 || !phase2) return null;

    const phaseWeights = weights[baseName] || { phase1: 60, phase2: 40 };

    const participantList = Array.from(
      new Set([...phase1.participants, ...phase2.participants])
    );

    const scores = participantList.map((p) => {
      const avg1 = Number(calcAvg(phase1, p) || 0);
      const avg2 = Number(calcAvg(phase2, p) || 0);
      return {
        name: p,
        phase1Score: avg1,
        phase2Score: avg2,
        finalScore: (avg1 * phaseWeights.phase1 + avg2 * phaseWeights.phase2) / 100,
      };
    });

    return (
      <div key={idx} className="card">
        <h3>{baseName} - Final Combined Ranking</h3>
        <p>🎯 Weighting: Phase 1 = {phaseWeights.phase1}% | Phase 2 = {phaseWeights.phase2}%</p>

        {viewMode === 'organizer' && (
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <button
              className="btn-yellow"
              onClick={() => {
                const p1 = prompt('Enter Phase 1 weight (%)', phaseWeights.phase1.toString());
                const p2 = prompt('Enter Phase 2 weight (%)', phaseWeights.phase2.toString());

                if (p1 !== null && p2 !== null) {
                  const num1 = parseFloat(p1);
                  const num2 = parseFloat(p2);

                  if (num1 + num2 !== 100) {
                    alert('Weights must sum to 100%');
                    return;
                  }

                  updateWeights(baseName, { phase1: num1, phase2: num2 });
                }
              }}
            >
              ⚙️ Edit Weights
            </button>
            {/* Save Weights */}
            <button
  className="btn-green"
  onClick={() => saveWeights(baseName, phaseWeights)}
>
  💾 Save Weights
</button>

            <button
              className="btn-blue"
              onClick={() => toggleTwoPhaseVisibility(baseName)}
            >
              {twoPhaseVisibility[baseName] ? '🙈 Hide from Judges' : '👁️ Show to Judges'}
            </button>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Participant</th>
              <th>Phase 1 Score</th>
              <th>Phase 2 Score</th>
              <th>Final Weighted Score</th>
            </tr>
          </thead>
          <tbody>
            {scores
              .sort((a, b) => b.finalScore - a.finalScore)
              .map((row, i) => (
                <tr key={i}>
                  <td>{row.name}</td>
                  <td>{row.phase1Score.toFixed(2)}</td>
                  <td>{row.phase2Score.toFixed(2)}</td>
                  <td>{row.finalScore.toFixed(2)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  })}

                      {events.length === 0 ? (
            <p className="text-center">
              📭 No events yet. Click "➕ Add Event" to begin.
            </p>
          ) : (
            events.map((ev, idx) => {
              return (
                <div key={idx} className="card">
                  <div className="flex-center">
                    <h2>{ev.name}</h2>
                    <button
                      onClick={() => toggleVisibility(idx)}
                      className={ev.visibleToJudges ? 'btn-red' : 'btn-green'}
                    >
                      {ev.visibleToJudges
                        ? 'Hide from Judges'
                        : 'Show to Judges'}
                    </button>
                    <button
                      onClick={() => deleteEvent(idx)}
                      className="btn-red"
                    >
                      ❌ Delete
                    </button>
                  </div>

                  <div className="flex-center">
                    <button
                      className="btn-purple"
                      onClick={() =>
                        promptEditList(
                          'Edit Participants',
                          ev.participants,
                          (newList) =>
                            updateEvent(idx, { ...ev, participants: newList })
                        )
                      }
                    >
                      👥 Participants
                    </button>

                    <button
  className="btn-yellow"
  onClick={() =>
    promptEditList('Edit Judges', ev.judges, (newList) => {
      const updatedWeights: { [judge: string]: number } = {};
    
      newList.forEach((j) => {
        const oldWeight = ev.judgeWeights?.[j] ?? '';
        const w = prompt(`Set weight for ${j} (in %):`, oldWeight.toString());
    
        if (w !== null && !isNaN(parseFloat(w))) {
          updatedWeights[j] = parseFloat(w);
        }
      });
      updateEvent(idx, {
        ...ev,
        judges: newList,
        judgeWeights: updatedWeights,
      });
    })
  }
>
  🧑‍⚖️ Judges
</button>

                    <button
                      className="btn-blue"
                      onClick={() =>
                        promptEditList(
                          'Edit Criteria (use format: Creativity (10))',
                          ev.criteria.map((c) =>
                            typeof c === 'string' ? c : `${c.name} (${c.max})`
                          ),
                          (newList) =>
                            updateEvent(idx, {
                              ...ev,
                              criteria: newList.map((entry) => {
                                const match = entry.match(/(.+?)\s*\((\d+)\)/);
                                if (match) {
                                  return {
                                    name: match[1].trim(),
                                    max: parseInt(match[2]),
                                  };
                                }
                                return { name: entry.trim(), max: 10 };
                              }),
                            })
                        )
                      }
                    >
                      📋 Criteria
                    </button>

                    <button
                      className="btn-gray"
                      onClick={() => toggleResultsVisibility(idx)}
                    >
                      {ev.resultsVisibleToJudges
                        ? '🙈 Hide Results from Judges'
                        : '👁️ Show Results to Judges'}
                    </button>
                    <button
  className="btn-blue"
  onClick={() => {
    const phase = prompt('Set event phase: (Phase 1 / Phase 2)', ev.phaseCategory || '');
    if (phase === 'Phase 1' || phase === 'Phase 2') {
      updateEvent(idx, { ...ev, phaseCategory: phase });
    } else if (phase) {
      alert('Invalid phase. Must be "Phase 1" or "Phase 2".');
    }
  }}
>
  🎯 Set Phase
</button>
                  </div>

                  <table>
                    <thead>
                      <tr>
                        <th>Participant</th>
                        {ev.judges.map((j, jdx) => (
                          <th key={jdx}>
                          {j} ({ev.judgeWeights?.[j] || 0}%)
                        </th>                        
                        ))}
                        <th>Total</th>
                        <th>Average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ev.participants.map((p, pdx) => (
                        <tr key={pdx}>
                          <td>{p}</td>
                          {ev.judges.map((j, jdx) => (
                            <td key={jdx}>{calcTotalForJudge(ev, j, p)}</td>
                          ))}
                          <td>{calcTotalAllJudges(ev, p)}</td>
                          <td>{calcAvg(ev, p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {ev.resultsVisibleToJudges && renderSummary(ev)}
                </div>
              );
            })
          )}
        </>
      ) : (// --- Judge View Rendering ---
      <>
        <div className="top-bar">
          <h1>🎯 Digital Scoresheet</h1>
          <p className="text-center credits">made by JCTA</p>
          <button className="btn-gray" onClick={refreshAllData}>
            🔄 Refresh Data
          </button>
        </div>
      
        {visibleJudgeEvents.length === 0 ? (
          <p
            style={{
              textAlign: 'center',
              marginTop: '60px',
              fontSize: '18px',
              fontWeight: 'bold',
              color: '#444',
            }}
          >
            There's no assigned events yet. Please wait for the organizer.
            Thank you!
          </p>
        ) : (
          <>
            {/* --- Single-Phase Events Rendering --- */}
            {visibleJudgeEvents.map((ev, idx) => {
              const safeCriteria = ev.criteria.map(
                (c: string | { name: string; max: number }) => {
                  if (typeof c === 'string') {
                    const match = c.match(/^(.*?)(?:\s*\((\d+)\))?$/);
                    return {
                      name: match?.[1]?.trim() || c,
                      max: match?.[2] ? parseInt(match[2]) : 10,
                    };
                  }
                  return c;
                }
              );
      
              return (
                <div key={idx} className="card">
                  <h2>{ev.name}</h2>
                  {!ev.submittedJudges?.includes(currentJudge) && (
                    <p
                      style={{
                        color: 'red',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      Important: After submitting, you can view the scores but you
                      cannot change it. Final ranking will be shown after the
                      organizer received all scores from all judges. Thank you!
                    </p>
                  )}
                  <table>
                    <thead>
                      <tr>
                        <th>Participant</th>
                        {safeCriteria.map((c, cdx) => (
                          <th key={cdx}>
                            {c.name} ({c.max})
                          </th>
                        ))}
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ev.participants.map((p, pdx) => (
                        <tr key={pdx}>
                          <td>{p}</td>
                          {safeCriteria.map((c, cdx) => (
                            <td key={cdx}>
                              <input
                                type="number"
                                min={0}
                                max={c.max}
                                value={
                                  tempScores?.[idx]?.[p]?.[c.name] ??
                                  ev.scores?.[currentJudge]?.[p]?.[c.name] ??
                                  ''
                                }
                                disabled={ev.submittedJudges?.includes(currentJudge)}
                                onChange={(e) => {
                                  const newVal = e.target.value;
                                  if (Number(newVal) <= c.max) {
                                    setTempScores((prev) => ({
                                      ...prev,
                                      [idx]: {
                                        ...(prev[idx] || {}),
                                        [p]: {
                                          ...(prev[idx]?.[p] || {}),
                                          [c.name]: newVal,
                                        },
                                      },
                                    }));
                                  }
                                }}
                                onBlur={() => {
                                  const val =
                                    tempScores?.[idx]?.[p]?.[c.name];
                                  if (val !== undefined && val !== '') {
                                    handleInputScore(
                                      idx,
                                      currentJudge,
                                      p,
                                      c.name,
                                      Number(val)
                                    );
                                  }
                                }}
                              />
                            </td>
                          ))}
                          <td>{calcTotalForJudge(ev, currentJudge, p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
      
                  {!ev.submittedJudges?.includes(currentJudge) ? (
                    <button
                      className="btn-green"
                      onClick={() => handleSubmitScores(idx)}
                    >
                      Submit Scores
                    </button>
                  ) : (
                    <>
                      <p className="submitted-label">
                        Submitted. You can view but not change scores.
                      </p>
                      {ev.resultsVisibleToJudges && renderSummary(ev)}
                    </>
                  )}
                            <button className="btn-red" onClick={handleAuthLogout}>
            🚪 Logout
          </button>

                </div>
              );
            })}
      
            {/* --- Combined Two-Phase Results --- */}
            <h2></h2>
            {getTwoPhaseGroups()
              .filter((group) => twoPhaseVisibility[group.baseName])
              .map((group, idx) => {
                const { baseName, phase1, phase2 } = group;
                if (!phase1 || !phase2) return null;
      
                const phaseWeights = weights[baseName] ?? { phase1: 60, phase2: 40 };

                const participantList = Array.from(
                  new Set([...phase1.participants, ...phase2.participants])
                );
                
                const scores = participantList.map((p) => {
                  const avg1 = Number(calcAvg(phase1, p) || 0);
                  const avg2 = Number(calcAvg(phase2, p) || 0);
                
                  return {
                    name: p,
                    phase1Score: avg1,
                    phase2Score: avg2,
                    finalScore:
                      (avg1 * phaseWeights.phase1 + avg2 * phaseWeights.phase2) / 100,
                  };
                });
                
                return (
                  <div key={idx} className="card">
                    <h3>{baseName} - Final Combined Ranking</h3>
                    <p>
                      🎯 Weighting: Phase 1 = {phaseWeights.phase1}% | Phase 2 = {phaseWeights.phase2}%
                    </p>                                    <table>
                      <thead>
                        <tr>
                          <th>Participant</th>
                          <th>Phase 1 Score</th>
                          <th>Phase 2 Score</th>
                          <th>Final Weighted Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scores
                          .sort((a, b) => b.finalScore - a.finalScore)
                          .map((row, i) => (
                            <tr key={i}>
                              <td>{row.name}</td>
                              <td>{row.phase1Score.toFixed(2)}</td>
                              <td>{row.phase2Score.toFixed(2)}</td>
                              <td>{row.finalScore.toFixed(2)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
          </>
        )}
      </>
      )}      
    </div>
    </DisabledWrapper>
          {/* Chat Section */}
          <div className="chat-box">
          <button
            className="btn-purple"
            onClick={() => setChatOpen((prev) => !prev)}
          >
            💬 {chatOpen ? 'Close Chat' : 'Open Chat'}
          </button>
  
          {chatOpen && (
            <div className="chat-window">
              <div className="chat-messages">
                {chatMessages.map((msg, i) => (
                  <p key={i}>
                    <strong>{msg.sender}:</strong> {msg.text}
                  </p>
                ))}
              </div>
              <div className="chat-input">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                />
                <button className="btn-blue" onClick={handleSendMessage}>
                  Send
                </button>
              </div>
            </div>
          )}
        </div>  
      {/* Freeze/Unfreeze Button at the bottom - ALWAYS clickable */}
    <div style={{ marginTop: '20px', textAlign: 'center' }}>
    <button className="btn-red" onClick={handleFreeze}>
      {frozen ? '🔓 Unfreeze' : '❄️ Freeze'}
    </button>
    <button className="btn-red" onClick={handleAuthLogout}>
                🚪 Logout
              </button>
  </div>
</>
  );
}