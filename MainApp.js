// MainApp.js
import { Ionicons } from '@expo/vector-icons';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import { equalTo, get, onValue, orderByChild, push, query, ref, remove, set } from 'firebase/database';
import React, { useContext, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import ExportButton from './components/ExportButton.js';
import { AuthContext } from './contexts/AuthContext.js';
import { auth, db } from './firebaseConfig'; // compat versions

export default function MainApp({ navigation }) {
const profile = useContext(AuthContext);
const isAdmin = profile?.role === 'admin';
const isUsher = profile?.role === 'usher';
  // — Manage-Account state & handlers —
  const [showManage, setShowManage] = useState(false);
  const [currentUserChurch, setCurrentUserChurch] = useState(null);
  const [currentUserRole,   setCurrentUserRole]   = useState('admin');
// ── at top of MainApp() ──
const [memberCount,    setMemberCount]    = useState(0);
const [avgAttendance,  setAvgAttendance]  = useState(0);
const [churchProfile,  setChurchProfile]  = useState({ email:'', phone:'', address:'' });

// for editing
const [editPhone,    setEditPhone]    = useState('');
const [editAddress,  setEditAddress]  = useState('');

// 1) Load profile once
useEffect(() => {
  const uid = auth.currentUser?.uid;
  if (!uid) return navigation.replace('Login');

  get(ref(db, `users/${uid}`))
    .then(snap => {
      const p = snap.val() || {};
      setCurrentUserChurch(p.church || null);
      setChurchProfile({
        email:   p.email   || '',
        phone:   p.phone   || '',
        address: p.address || ''
      });
      setEditPhone(p.phone   || '');
      setEditAddress(p.address || '');
    })
    .catch(err => {
      console.warn('Error loading profile', err);
      setCurrentUserChurch(null);
    });
}, []);

// 2) when Manage opens, fetch both counts & attendance in one go
useEffect(() => {
  if (!showManage || !currentUserChurch) return;

  // 1️⃣ Fetch all members in the church
  const membersQ = query(
    ref(db, 'members'),
    orderByChild('church'),
    equalTo(currentUserChurch)
  );
  get(membersQ).then(memberSnap => {
    const membersData = memberSnap.val() || {};
    const memberIds   = Object.keys(membersData);
    const count       = memberIds.length;
    setMemberCount(count);

    // If no members, short-circuit to zero
    if (count === 0) {
      setAvgAttendance(0);
      return;
    }

    // 2️⃣ Fetch the entire attendance history
    get(ref(db, 'attendance')).then(attSnap => {
      const allAtt = attSnap.val() || {};
      const days   = Object.keys(allAtt);
      if (days.length === 0) {
        setAvgAttendance(0);
        return;
      }

      // 3️⃣ For each day, count how many of *these* members attended
      let totalPct = 0;
      days.forEach(dayKey => {
        const presentMap = allAtt[dayKey] || {};
        // Only count those IDs that are in this church
        const presentCount = memberIds.filter(id => presentMap[id]).length;
        totalPct += (presentCount / count) * 100;
      });

      // 4️⃣ Compute the average and clamp to [0,100]
      const rawAvg = totalPct / days.length;
      setAvgAttendance(Math.min(100, Math.max(0, Math.round(rawAvg))));
    });
  });
}, [showManage, currentUserChurch]);

// 3) Save phone & address edits
const saveProfile = async () => {
  const uid = auth.currentUser.uid;
  try {
    await set(ref(db, `users/${uid}/phone`),   editPhone);
    await set(ref(db, `users/${uid}/address`), editAddress);
    setChurchProfile(cp => ({
      ...cp,
      phone:   editPhone,
      address: editAddress
    }));
    Alert.alert('Saved', 'Contact details updated.');
  } catch (e) {
    Alert.alert('Error', e.message);
  }
};

  const onResetPassword = async () => {
    try {
      await auth.sendPasswordResetEmail(auth.currentUser.email);
      Alert.alert('Email sent', 'Check your inbox for reset instructions.');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };
  
  const onResetEmail = () => {
    Alert.alert(
      'Forgot Email',
      'Please contact your church administrator to recover your account email.'
    );
  }

  const onLogout = () => {
    Alert.alert(
      'Log out?',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, log me out',
          style: 'destructive',
          onPress: async () => {
            await auth.signOut();
            navigation.replace('Login');
          }
        }
      ]
    );
  };

  // — Helpers & “today” key —
  function getOrdinal(n) {
    const s = ['th','st','nd','rd'], v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  const todayKey = `${yyyy}-${mm}-${dd}`;
  function formatKey(key) {
    if (!key) return '';
    const [y,m,d] = key.split('-').map(Number);
    const dt = new Date(y,m-1,d);
    const dayName   = dt.toLocaleDateString('en-GB',{weekday:'long'});
    const monthName = dt.toLocaleDateString('en-GB',{month:'long'});
    return `${dayName}, ${d}${getOrdinal(d)} ${monthName} ${y}`;
  }

  // — State —
  const [members, setMembers]             = useState([]);
  // const [newName, setNewName]             = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [teamsMap, setTeamsMap]           = useState({});
  const [editingMember, setEditingMember] = useState(null);
  const [editFields, setEditFields]       = useState({});
  const [presentMap, setPresentMap]       = useState({});
  const [searchText, setSearchText]       = useState('');
  const [viewMode, setViewMode]           = useState('attendance');
  const [dateList, setDateList]           = useState([]);
  const [allAttendance, setAllAttendance] = useState({});
  const [attendanceByDate, setABY]        = useState({});
  const [selectedDate, setSelectedDate]   = useState(todayKey);
  const [expandedDates, setExpandedDates] = useState([]);
  const [currentPage, setCurrentPage]     = useState(1);
  const [historySearch, setHistorySearch] = useState('');

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue,   setRenameValue]     = useState('');

// track which team you’re renaming:
  const [renameTeamId,  setRenameTeamId]    = useState(null);

  const [showAddModal, setShowAddModal]     = useState(false);
  const [teamToAddTo,  setTeamToAddTo]      = useState(null);
  const [addSearch,    setAddSearch]        = useState('');

  // for Members pagination
  const [currentMembersPage, setCurrentMembersPage] = useState(1);

// for History pagination
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);

  const pageSize = 20;

  const [teams, setTeams]                 = useState({});
  const categories = ['Member','Elder','Deacon','Deaconess'];

  // Profile modal
  const [profileMember, setProfileMember] = useState(null);

  // Teams CRUD
  const [teamsList, setTeamsList]     = useState([]); // [{ id, name }]
  const [newTeamName, setNewTeamName] = useState('');
  const [renamingId, setRenamingId]   = useState(null);
  const [renamedName, setRenamedName] = useState('');

// 1) Load the current user’s church & role once on mount
useEffect(() => {
  const uid = auth.currentUser?.uid;
  if (!uid) return navigation.replace('Login');

  get(ref(db, `users/${uid}`))
    .then(snap => {
      const profile = snap.val() || {};
      setCurrentUserChurch(profile.church || null);
      setCurrentUserRole(profile.role   || 'admin');
    })
    .catch(err => {
      console.error('Failed to load user profile', err);
      setCurrentUserChurch(null);
    });
}, []);

// 2) Load only members in that church via an RTDB query
useEffect(() => {
  if (!currentUserChurch) return;

  const membersQ = query(
    ref(db, 'members'),
    orderByChild('church'),
    equalTo(currentUserChurch)
  );

  const unsubscribe = onValue(membersQ, snapshot => {
    const data = snapshot.val() || {};

    // map each member node → our UI object
    const list = Object.entries(data).map(([id, m]) => {
      const first = m.firstName || '';
      const last  = m.lastName  || '';
      return {
        id,
        name:      [first, last].filter(Boolean).join(' '),
        title:     m.Title            || '',
        office:    m.Office           || '',
        firstName:                    first,
        lastName:                      last,
        birthday:  m.Birthday         || '',
        address:   m.Address          || '',
        phone:     m['Phone Number']  || '',
        email:     m.Email            || '',
        role:      m.Role             || '',
        age:       m.Age              || '',
        joined:    m.Joined           || null,
        gender:    m.Gender           || '',
        bornAgain: m.BornAgain            === true,
        baptisedByImmersion: m.BaptisedByImmersion    === true,
        receivedHolyGhost:   m.ReceivedHolyGhost      === true,
        teams: Array.isArray(m.Teams)
          ? m.Teams
          : m.Teams
            ? Object.keys(m.Teams)
            : [],
      };
    });

    // debug the very first member
    // console.log('Loaded member[0]:', list[0]);

    // update state
    setMembers(list);

    // rebuild presentMap
    setPresentMap(prev => {
      const updated = {};
      list.forEach(m => {
        updated[m.id] = prev[m.id] || false;
      });
      return updated;
    });

    // rebuild teamsMap
    setTeamsMap(
      list.reduce((acc, m) => {
        acc[m.id] = m.teams;
        return acc;
      }, {})
    );
  });

  return unsubscribe;
}, [currentUserChurch]);


// Load attendance history once
useEffect(() => {
  const off = onValue(ref(db, 'attendance'), snap => {
    const all = snap.val() || {};
    // sort dates newest-last, but put today on top
    const today = new Date().toISOString().slice(0,10);
    const keys = Object.keys(all).sort();
    if (!keys.includes(today)) keys.unshift(today);
    setDateList(keys);
    setABY(all);
  });
  return () => off();
}, []);

// — Unified attendance listener —  
useEffect(() => {
  // subscribe to all attendance once and update both dateList & presentMap
  const attendanceRef = ref(db, 'attendance');
  const unsubscribe    = onValue(attendanceRef, snap => {
    const data = snap.val() || {};

    // 1) rebuild sorted dateList (todayKey first)
    const keys = Object.keys(data).sort();
    if (!keys.includes(todayKey)) keys.unshift(todayKey);
    setDateList(keys);

    // 2) ensure selectedDate is valid (fallback to today)
    if (!keys.includes(selectedDate)) {
      setSelectedDate(todayKey);
    }

    // 3) rebuild entire allAttendance
    setAllAttendance(data);

    // 4) rebuild presentMap for the now-current selectedDate
    const todayData = data[selectedDate] || {};
    setPresentMap(
      members.reduce(
        (acc, m) => ({ ...acc, [m.id]: Boolean(todayData[m.id]) }),
        {}
      )
    );
  });

  return unsubscribe;
}, [members, selectedDate]);

// — Load canonical teams list scoped by church —
useEffect(() => {
  if (!currentUserChurch) return;

  // Build a Firebase query for teams where .church === currentUserChurch
  const teamsQuery = query(
    ref(db, 'teams'),
    orderByChild('church'),
    equalTo(currentUserChurch)
  );

// Subscribe and map incoming data to [{ id, name }]
const unsubscribe = onValue(teamsQuery, snap => {
  const data = snap.val() || {};
  const list = Object.entries(data).map(([id, t]) => ({
    id,
    name: t.name || ''
  }));
  setTeamsList(list);
});

// Clean up listener on unmount / church change
return unsubscribe;
}, [currentUserChurch]);

// — Attendance actions & counts —
const presentCount = members.filter(m => presentMap[m.id]).length;
const absentCount  = members.length - presentCount;

const markAll = () =>
  setPresentMap(members.reduce((acc, m) => ({ ...acc, [m.id]: true }), {}));

const clearAll = () =>
  setPresentMap(members.reduce((acc, m) => ({ ...acc, [m.id]: false }), {}));

const saveAttendance = async () => {
  await set(ref(db, `attendance/${selectedDate}`), presentMap);
  Alert.alert(
    'Saved',
    `Attendance for ${formatKey(selectedDate)} saved.`
  );
};

// toggles that member’s “present” bit in local state
const togglePresent = id => {
  setPresentMap(pm => ({ 
    ...pm, 
    [id]: !pm[id] 
  }));
};

// 3) Load only teams in that church
useEffect(() => {
  if (!currentUserChurch) return;
  const teamsQ = query(
    ref(db, 'teams'),
    orderByChild('church'),
    equalTo(currentUserChurch)
  );
  const unsubscribe = onValue(teamsQ, snap => {
    const data = snap.val() || {};
    const list = Object.entries(data).map(([id,t])=>({
      id,
      name: t.name || ''
    }));
    setTeamsList(list);
  });
  return unsubscribe;
}, [currentUserChurch]);



// — Member CRUD & toggles —  
const addMember = async () => {
  // const name = newName.trim();
  // if (!name) {
  //   return Alert.alert('Validation', 'Please enter a member name.');
  // }

  const f = firstName.trim();
  const l = lastName.trim();
  if (!f) return Alert.alert('Validation', 'Please enter a first name.');
  if (!l) return Alert.alert('Validation', 'Please enter a last name.');

  // 1) create the new member node
  const newRef = push(ref(db, 'members'));
  const memberData = {
    // name,
    firstName: f,
    lastName: l,
    church: currentUserChurch,  // stamp in the current user’s church
    Joined: todayKey,
    Teams: {},                  // start with an empty teams map
    // team: 'Member',         // ← optional legacy primary-team field
  };
  await set(newRef, memberData);

  // 2) optionally mark them present today
  await set(
    ref(db, `attendance/${todayKey}/${newRef.key}`),
    true
  );

  // 3) sync local state so UI updates immediately
  setPresentMap(pm => ({
    ...pm,
    [newRef.key]: true
  }));

  // setNewName('');

  // // 4) Notify the user
  // Alert.alert(
  //   'Member Added',
  //   `${name} has been added and marked present for today.`
  // );

  // clear the inputs & notify
  setFirstName('');
  setLastName('');
  Alert.alert('Member Added', `${f} ${l} has been added and marked present.`);

};

const deleteMember = id => {
  Alert.alert(
    'Confirm',
    'Delete this member?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => db.ref(`members/${id}`).remove()
      }
    ]
  );
};

// — Teams CRUD handlers —  

// 1) Create a new team under /teams, with a `church` stamp:
const createTeam = async () => {
  const name = newTeamName.trim();
  if (!name) {
    return Alert.alert('Validation','Please enter a team name.');
  }
  // push a new team record
  const newRef = push(ref(db, 'teams'));
  await set(newRef, {
    name,
    church: currentUserChurch   // ← record which church owns this team
  });
  setNewTeamName('');
};

// assign adds to Teams map
const assignTeam = async (memberId, teamId) => {
  try {
    await set(ref(db, `members/${memberId}/Teams/${teamId}`), true);
    // update local UI state if needed
  } catch (e) {
    Alert.alert('Error', e.message);
  }
};



// remove deletes from Teams map
const removeMemberFromTeam = async (memberId, teamId) => {
  try {
    await remove(ref(db, `members/${memberId}/Teams/${teamId}`));
    // update local UI state if needed
  } catch (e) {
    Alert.alert('Error', e.message);
  }
};

// 2) Ask for confirmation before calling it
const confirmRemoveFromTeam = (memberId, teamId, teamName) => {
  Alert.alert(
    `Remove from ${teamName}?`,
    'Are you sure you want to remove this member from the team?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeMemberFromTeam(memberId, teamId),
      },
    ]
  );
};

// deleteTeam: remove team and remove key from all members
const deleteTeam = (teamId) => {
  Alert.alert(
    'Delete Department/Ministry?',
    'This will remove the chosen Department/Ministry from all members.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // 1) Fetch all members
            const membersSnap = await get(ref(db, 'members'));
            const updates = {};

            if (membersSnap.exists()) {
              membersSnap.forEach((memberSnap) => {
                const mid = memberSnap.key;
                const mdata = memberSnap.val();

                // only remove if this member belongs to the same church AND has this team
                if (
                  mdata.church === currentUserChurch &&
                  mdata.Teams?.[teamId]
                ) {
                  updates[`members/${mid}/Teams/${teamId}`] = null;
                }
              });
            }

            // 2) Batch-remove all those team entries
            if (Object.keys(updates).length) {
              await update(ref(db), updates);
            }

            // 3) Finally remove the team node itself
            await remove(ref(db, `teams/${teamId}`));

            Alert.alert('Deleted', 'Team removed successfully.');
          } catch (e) {
            console.error(e);
            Alert.alert('Error', e.message);
          }
        },
      },
    ]
  );
};

// 5) Rename a team (updates only the team’s own node)
const startRename = (id, name) => {
  setRenamingId(id);
  setRenamedName(name);
};
const confirmRename = async () => {
  const newNameTrimmed = renamedName.trim();
  if (!newNameTrimmed) return;
  await set(ref(db, `teams/${renamingId}/name`), newNameTrimmed);
  setRenamingId(null);
  setRenamedName('');
};

// // 6) UI helper to pop a list of members *not yet* in that team:
// const addMemberToTeamPrompt = teamId => {
//   // filter out anyone who already has this teamId in their teamsMap
//   const available = members.filter(
//     m => !(teamsMap[m.id] || []).includes(teamId)
//   );
//   if (available.length === 0) {
//     return Alert.alert('No one left to add');
//   }

//   Alert.alert(
//     `Add to ${teamsList.find(t => t.id === teamId)?.name}`,
//     null,
//     [
//       // one button per available member
//       ...available.map(m => ({
//         text: m.name,
//         onPress: async () => {
//           // 1) write to RTDB under members/{uid}/Teams/{teamId} = true
//           await set(ref(db, `members/${m.id}/Teams/${teamId}`), true);
          
//           // 2) update local multi-team lookup
//           setTeamsMap(prev => ({
//             ...prev,
//             [m.id]: [...(prev[m.id] || []), teamId],
//           }));
//         }
//       })),
//       // Cancel button
//       { text: 'Cancel', style: 'cancel' }
//     ]
//   );
// };

const addMemberToTeamPrompt = teamId => {
  setTeamToAddTo(teamId);
  setAddSearch('');
  setShowAddModal(true);
};

// 2) swap out your Alert.prompt(...) call for this helper:
function openRenameModal(id, currentName) {
  setRenameTeamId(id);
  setRenameValue(currentName);
  setShowRenameModal(true);
}


// — Attendance % & last-attended helpers —
function getPct(id, joined) {
  const validDates = dateList.filter(
    d => d >= joined && allAttendance[d]
  );
  if (validDates.length === 0) return 100;
  const hits = validDates.filter(
    d => Boolean(allAttendance[d][id])
  ).length;
  return Math.round((hits / validDates.length) * 100);
}

function getLastAttendanceDate(id) {
  for (let i = dateList.length - 1; i >= 0; i--) {
    const d = dateList[i];
    if (allAttendance[d]?.[id]) return d;
  }
  return null;
}


// count how many members are present on a given date
const countPresentFor = (dateKey) => {
  const day = allAttendance[dateKey] || {};
  return Object.values(day).filter(Boolean).length;
};

// count how many members are absent on a given date
const countAbsentFor = (dateKey) => {
  const present = countPresentFor(dateKey);
  return members.length - present;
};

// compute % present on a given date
const pctPresentFor = (dateKey) => {
  const total = members.length;
  if (total === 0) return 0;
  return Math.round((countPresentFor(dateKey) / total) * 100);
};
 
// ── Filter & paginate for members ──
const filteredMembers = members.filter(m => {
  const q = searchText.trim().toLowerCase();
  return (
    m.firstName.toLowerCase().includes(q) ||
    m.lastName.toLowerCase().includes(q)
  );
});
const totalPages = Math.max(1, Math.ceil(filteredMembers.length / pageSize));
const displayedItems = filteredMembers.slice(
  (currentPage - 1) * pageSize,
  currentPage * pageSize
);

// ─── Pagination for Teams ───
const filteredTeams = teamsList.filter(t =>
  t.name.toLowerCase().includes(searchText.trim().toLowerCase())
);
const totalTeamPages = Math.max(
  1,
  Math.ceil(filteredTeams.length / pageSize)
);
const displayedTeams = filteredTeams.slice(
  (currentPage - 1) * pageSize,
  currentPage * pageSize
);;

// ─── Pagination for Members View ───
const filteredMembersList = members.filter(m =>
  m.name.toLowerCase().includes(searchText.trim().toLowerCase())
);
const totalMemberPages = Math.max(
  1,
  Math.ceil(filteredMembersList.length / pageSize)
);
const displayedMemberItems = filteredMembersList.slice(
  (currentMembersPage - 1) * pageSize,
  currentMembersPage * pageSize
);

// ─── Pagination for History View ───
// 1) Filter your dateList by the search term
const filteredDates = dateList.filter(dateKey => {
  const label = dateKey === todayKey ? 'Today' : formatKey(dateKey);
  return label
    .toLowerCase()
    .includes(historySearch.trim().toLowerCase());
});

// 2) Compute how many pages
const totalHistoryPages = Math.max(
  1,
  Math.ceil(filteredDates.length / pageSize)
);

// 3) Slice out the items for the current page
const displayedHistoryItems = filteredDates.slice(
  (currentHistoryPage - 1) * pageSize,
  currentHistoryPage * pageSize
);

  // — Unique team names & expansion state —
  const uniqueTeams = teamsList.map(t=>t.name);
  const [expandedTeams, setExpandedTeams] = useState([]);

    // helper to toggle a team’s expanded/collapsed state
    const toggleTeamExpansion = (teamId) => {
      setExpandedTeams(prev =>
        prev.includes(teamId)
          ? prev.filter(id => id !== teamId)
          : [...prev, teamId]
      );
    };

  // — Renderers for each view —
  const renderAttendanceMember = ({ item }) => {
    const pres = presentMap[item.id];
    return (
      <TouchableOpacity style={styles.row} onPress={()=>togglePresent(item.id)}>
        <Text style={[styles.member, pres && styles.presentText]}>{item.name}</Text>
        <Ionicons name={pres?'checkmark-circle':'ellipse-outline'} size={24} color={pres?'#4CAF50':'#888'} />
      </TouchableOpacity>
    );
  };

  const renderMemberRow = ({ item }) => {
    // join that member’s team IDs → names
    const teamNames = (teamsMap[item.id] || [])
      .map(id => teamsList.find(t => t.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  
    // const isUsher = currentUserRole === 'usher';
  
    return (
      <View style={styles.row}>
        <Text style={styles.member}>{item.firstName} {item.lastName}</Text>
  
        <View style={styles.memberActions}>
          {/* only admins can edit */}
          {!isUsher && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => {
                setEditingMember(item.id);
                setEditFields({
                  title:     profileMember.title       || '',
                  firstName:           item.firstName  || '',
                  lastName:            item.lastName   || '',
                  office:    profileMember.office      || '',
                  birthday:            item.birthday,
                  age:                 item.age,
                  address:             item.address,
                  phone:               item.phone,
                  email:               item.email,
                  role:                item.role,
                  gender:              item.gender,
                  teams:               teamNames,
                  bornAgain:           item.bornAgain,
                  baptisedByImmersion: item.baptisedByImmersion,
                  receivedHolyGhost:   item.receivedHolyGhost,     // seeded from teamsMap
                });
              }}
            >
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
  
          {/* everyone gets a View button */}
          <TouchableOpacity
            style={styles.viewBtn}
            onPress={() => setProfileMember(item)}
          >
            <Text style={styles.viewBtnText}>View</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderTeam = ({ item }) => {
    const { id: teamId, name: teamName } = item;
    const isExp = expandedTeams.includes(teamId);
  
    // find all members whose teamsMap includes this teamId
    const membersInTeam = members.filter(m =>
      teamsMap[m.id]?.includes(teamId)
    );
  
    return (
      <View style={styles.historyBlock}>
        <TouchableOpacity
          style={styles.historyHeader}
          onPress={() =>
            setExpandedTeams(e =>
              e.includes(teamId)
                ? e.filter(x => x !== teamId)
                : [...e, teamId]
            )
          }
        >
          <Text style={styles.historyDate}>
            {teamName} ({membersInTeam.length})
          </Text>
  
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons
              name="add-circle-outline"
              size={20}
              color="#4CAF50"
              style={{ marginRight: 12 }}
              onPress={() => addMemberToTeamPrompt(teamId)}
            />
            <Ionicons
              name="pencil"
              size={20}
              color="#888"
              style={{ marginRight: 12 }}
              onPress={() => openRenameModal(teamId, teamName)}
            />
            <Ionicons
              name="trash"
              size={20}
              color="#e33"
              style={{ marginRight: 12 }}
              onPress={() =>
                Alert.alert(
                  `Delete team "${teamName}"?`,
                  'This will unassign all its members. Continue?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => deleteTeam(teamId),
                    },
                  ]
                )
              }
            />
            <Ionicons
              name={isExp ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#333"
            />
          </View>
        </TouchableOpacity>
  
        {isExp &&
          membersInTeam.map(m => (
            <View key={m.id} style={styles.row}>
              <Text style={styles.member}>{m.name}</Text>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    `Remove ${m.name} from "${teamName}"?`,
                    '',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => removeMemberFromTeam(m.id),
                      },
                    ]
                  )
                }
              >
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
      </View>
    );
  };

  const renderHistoryItem = ({ item: dateKey }) => {
    const isExp = expandedDates.includes(dateKey);
    const att   = allAttendance[dateKey] || {};
  
    return (
      <View style={styles.historyBlock}>
        <TouchableOpacity
          style={styles.historyHeader}
          onPress={() => {
            setExpandedDates(ed =>
              ed.includes(dateKey)
                ? ed.filter(d => d !== dateKey)
                : [...ed, dateKey]
            );
          }}
        >
          <Text style={styles.historyDate}>
            {dateKey === todayKey ? 'Today' : formatKey(dateKey)}
          </Text>
          <Ionicons
            name={isExp ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#333"
          />
        </TouchableOpacity>
  
        {isExp &&
          members.map(m => {
            const present = Boolean(att[m.id]);
            return (
              <View key={m.id} style={styles.row}>
                <Text style={styles.member}>{m.name}</Text>
                <Text
                  style={[
                    styles.presentText,
                    !present && { color: '#e33' }
                  ]}
                >
                  {present ? 'Present' : 'Absent'}
                </Text>
              </View>
            );
          })}
      </View>
    );
  };

  // Save edits back to Firebase
  async function saveEdits() {
    const id = editingMember;
    const updates = {
      Title:           editFields.title     || '',
      firstName:       editFields.firstName || '',
      lastName:        editFields.lastName  || '',
      Birthday:        editFields.birthday  || '',
      Age:             editFields.age       || '',
      Address:         editFields.address   || '',
      'Phone Number':  editFields.phone     || '',
      Email:           editFields.email     || '',
      Role:            editFields.role      || '',
      Gender:          editFields.gender    || '',
      Office:          editFields.office    || '',
      BornAgain:       !!editFields.bornAgain,
      BaptisedByImmersion: !!editFields.baptisedByImmersion,
      ReceivedHolyGhost:   !!editFields.receivedHolyGhost,
    };
  
    try {
      // 1) Write to Firebase
      await db.ref(`members/${id}`).update(updates);
  
      // 2) Update local members list
      setMembers(ms =>
        ms.map(m =>
          m.id === id
            ? {
                ...m,
                title:        updates.Title,
                office:       updates.Office,
                firstName: updates.firstName,
                lastName: updates.lastName,
                name: [updates.firstName, updates.lastName].filter(Boolean).join(' '),
                birthday: updates.Birthday,
                age: updates.Age,
                address: updates.Address,
                phone: updates['Phone Number'],
                email: updates.Email,
                role: updates.Role,
                gender: updates.Gender,
                bornAgain: updates.BornAgain,
                baptisedByImmersion: updates.BaptisedByImmersion,
                receivedHolyGhost: updates.ReceivedHolyGhost,
              }
            : m
        )
      );
  
      // 3) If that member is currently in the “view” modal, update it too
      setProfileMember(pm =>
        pm && pm.id === id
          ? {
              ...pm,
              title:        updates.Title,
              office:       updates.Office,
              firstName: updates.firstName,
              lastName: updates.lastName,
              name: [updates.firstName, updates.lastName].filter(Boolean).join(' '),
              birthday: updates.Birthday,
              age: updates.Age,
              address: updates.Address,
              phone: updates['Phone Number'],
              email: updates.Email,
              role: updates.Role,
              gender: updates.Gender,
              bornAgain: updates.BornAgain,
              baptisedByImmersion: updates.BaptisedByImmersion,
              receivedHolyGhost: updates.ReceivedHolyGhost,
            }
          : pm
      );
  
      // 4) Close the modal
        Alert.alert(
          'Profile Updated',
          'Member details have been saved successfully.',
          [
            {
              text: 'OK',
              onPress: () => setEditingMember(null),
            },
          ]
          );
  
    } catch (e) {
      console.error(e);
      Alert.alert('Save failed', e.message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 2×2 Grid */}
      <View style={styles.segmentGrid}>
        {['attendance','members','groups','history'].map(mode => {
          const label = mode==='groups' ? 'Departments & Ministries' : mode.charAt(0).toUpperCase()+mode.slice(1);
          return (
            <TouchableOpacity key={mode}
              style={[styles.gridBtn, viewMode===mode && styles.gridBtnActive]}
              onPress={()=>{ setViewMode(mode); setCurrentPage(1); }}
            >
              <Text style={[styles.gridText, viewMode===mode && styles.gridTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* — Manage Account Button — */}
      <TouchableOpacity style={styles.manageBtn} onPress={()=>setShowManage(true)}>
        <Ionicons name="person-circle-outline" size={36} color="#4CAF50" />
      </TouchableOpacity>

      {/* Attendance View */}
      {viewMode==='attendance' && (
        <View style={{flex:1}}>
          <Text style={styles.heading}>Add a new member</Text>
          <View style={styles.formRow}>
            <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="First Name"
            value={firstName}
            onChangeText={setFirstName}
            />
            <TextInput
            style={[styles.input, { flex: 1, marginLeft: 8 }]}
            placeholder="Last Name"
            value={lastName}
            onChangeText={setLastName}
            />
            <Button title="Add" onPress={addMember}/>
            </View>
          <View style={styles.datePicker}>
            <FlatList
              data={dateList}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateListContainer}
              keyExtractor={k=>k}
              renderItem={({item:k})=>(
                <TouchableOpacity
                  style={[styles.dateBtn, k===selectedDate && styles.dateBtnActive]}
                  onPress={()=>{ setSelectedDate(k); setCurrentPage(1); }}
                >
                  <Text style={[styles.dateBtnText, k===selectedDate && styles.dateBtnTextActive]}>
                    {k===todayKey ? 'Today' : formatKey(k)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
          <View style={styles.attHeader}>
            <Text style={styles.heading}>
              Attendance for {formatKey(selectedDate)}
            </Text>
            <Text style={styles.summary}>
              Present: {presentCount} | Absent: {absentCount}
            </Text>
            <View style={styles.shortcutRow}>
              <Button title="Mark All" onPress={markAll}/>
              <Button title="Clear All" color="#888" onPress={clearAll}/>
            </View>
          </View>
          <TextInput
            style={styles.search}
            placeholder="Search members…"
            placeholderTextColor="#666"
            value={searchText}
            onChangeText={t=>{ setSearchText(t); setCurrentPage(1); }}
          />
          <FlatList
            data={displayedItems}
            keyExtractor={i=>i.id}
            renderItem={renderAttendanceMember}
            ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
          />
          {filteredMembers.length > pageSize && (
            <View style={styles.pagination}>
              <Button title="Prev" disabled={currentPage<=1} onPress={()=>setCurrentPage(p=>Math.max(1,p-1))}/>
              <Text style={styles.pageIndicator}>{currentPage} / {totalPages}</Text>
              <Button title="Next" disabled={currentPage>=totalPages} onPress={()=>setCurrentPage(p=>Math.min(totalPages,p+1))}/>
            </View>
          )}
          <View style={styles.saveBtn}>
            <Button title="Save Attendance" onPress={saveAttendance}/>
          </View>
        </View>
      )}

{/* Manage Account modal */}
<Modal
  visible={showManage}
  animationType="slide"
  onRequestClose={() => setShowManage(false)}
>
  <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.heading}>Church Profile</Text>

      <Text style={styles.profileText}>
        Church Name: {currentUserChurch || '–'}
      </Text>
      <Text style={styles.profileText}>
        Members: {memberCount}
      </Text>
      <Text style={styles.profileText}>
        Avg. Attendance: {avgAttendance}%{/* already clamped 0–100 */}
      </Text>

      <Text style={[styles.heading, { marginTop: 24 }]}>
        Contact Details
      </Text>

      <Text style={styles.profileText}>
        Email: {churchProfile.email || '–'}
      </Text>

      {/* Editable phone */}
      <Text style={{ marginTop: 12 }}>Phone:</Text>
      <TextInput
        style={styles.input}
        value={editPhone}
        onChangeText={setEditPhone}
        placeholder="Phone number"
        placeholderTextColor="#666"
      />

      {/* Editable address */}
      <Text style={{ marginTop: 12 }}>Address:</Text>
      <TextInput
        style={styles.input}
        value={editAddress}
        onChangeText={setEditAddress}
        placeholder="Address"
        placeholderTextColor="#666"
      />

      {/* Action buttons */}
      <View style={{ marginTop: 32 }}>
        {/* 1) Save only phone/address */}
        <Button
          title="Save Details"
          onPress={async () => {
            try {
              const uid = auth.currentUser.uid;
              // write only the two fields
              await set(ref(db, `users/${uid}/phone`), editPhone);
              await set(ref(db, `users/${uid}/address`), editAddress);
              // update local state so the UI reflects the change
              setChurchProfile(p => ({
                ...p,
                phone: editPhone,
                address: editAddress,
              }));
              Alert.alert('Saved', 'Contact details updated.');
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          }}
        />
        <View style={{ height: 12 }} />

        <Button title="Reset Password" onPress={onResetPassword} />
        <View style={{ height: 12 }} />

        <Button title="Reset Email" onPress={onResetEmail} />
        <View style={{ height: 12 }} />

        <Button title="Log Out" color="#e33" onPress={onLogout} />
        <View style={{ height: 12 }} />

        <Button title="Return" onPress={() => setShowManage(false)} />

{/* Export Button only for admin */}
{isAdmin && (
  <ExportButton
    members={members}
    allAttendance={allAttendance}
    dateList={dateList}
    teamsList={teamsList}
  />
)}

{/* Footer: copyright & trademark */}
<View style={styles.footer}>
        <Text style={styles.footerText}>
          © 2025 SK Studio Lab. All rights reserved. ™ SK Studio Lab
        </Text>
      </View>
      </View>
    </ScrollView>
  </SafeAreaView>
</Modal>



{/* Members View */}
{viewMode === 'members' && (
  <View style={{ flex: 1, padding: 16 }}>
    <Text style={styles.heading}>Registered Members</Text>

    {/* search on firstName OR lastName */}
    <TextInput
      style={styles.search}
      placeholder="Search members…"
      placeholderTextColor="#666"
      value={searchText}
      onChangeText={text => {
        setSearchText(text);
        setCurrentPage(1);
      }}
    />

    <FlatList
      data={displayedItems}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.member}>
            {item.firstName} {item.lastName}
          </Text>
          <View style={styles.memberActions}>
            {!isUsher && (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => {
                  setEditingMember(item.id);
                  setEditFields({
                    title:               item.title,
                    office:              item.office,
                    firstName:           item.firstName,
                    lastName:            item.lastName,
                    birthday:            item.birthday,
                    age:                 item.age,
                    address:             item.address,
                    phone:               item.phone,
                    email:               item.email,
                    role:                item.role,
                    gender:              item.gender,
                    bornAgain:           item.bornAgain,
                    baptisedByImmersion: item.baptisedByImmersion,
                    receivedHolyGhost:   item.receivedHolyGhost,
                  });
                }}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={() => setProfileMember(item)}
            >
              <Text style={styles.viewBtnText}>View</Text>
            </TouchableOpacity>
            {!isUsher && (
            <Ionicons
            name="trash"
            size={24}
            color="#e33"
            onPress={() => deleteMember(item.id)}
            />
            )}
          </View>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
    />

    {/* pagination */}
    {filteredMembers.length > pageSize && (
      <View style={styles.pagination}>
        <Button
          title="Prev"
          disabled={currentPage <= 1}
          onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
        />
        <Text style={styles.pageInfo}>
          Page {currentPage} of {totalPages}
        </Text>
        <Button
          title="Next"
          disabled={currentPage >= totalPages}
          onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
        />
      </View>
    )}
  </View>
)}

{/* Teams View */}
{viewMode === 'groups' && (
  <View style={{ flex: 1, padding: 16 }}>
    {/* ─── Add New Team (admins only) ─── */}
    {isAdmin && (
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="New Department/Ministry"
          placeholderTextColor="#666"
          value={newTeamName}
          onChangeText={setNewTeamName}
        />
        <Button title="Add" onPress={createTeam} />
      </View>
    )}

    {/* ─── Rename Team Modal (admins only) ─── */}
    {isAdmin && (
      <Modal
        visible={!!renamingId}
        transparent
        animationType="fade"
        onRequestClose={() => setRenamingId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ marginBottom: 8 }}>Rename Department/Ministry</Text>
            <TextInput
              style={styles.input}
              value={renamedName}
              placeholderTextColor="#666"
              onChangeText={setRenamedName}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
              <Button title="Cancel" onPress={() => setRenamingId(null)} />
              <View style={{ width: 12 }} />
              <Button title="OK" onPress={confirmRename} />
            </View>
          </View>
        </View>
      </Modal>
    )}

    {/* ─── Add‐Member Modal (admins only) ─── */}
    {isAdmin && (
      <Modal visible={showAddModal} animationType="slide">
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', padding: 16, alignItems: 'center' }}>
            <TextInput
              style={styles.addModalSearch}
              placeholder="Search members…"
              value={addSearch}
              onChangeText={setAddSearch}
            />
            <Button title="Cancel" onPress={() => setShowAddModal(false)} />
          </View>
          <FlatList
            data={members
              .filter(m => !(teamsMap[m.id] || []).includes(teamToAddTo))
              .filter(m =>
                m.name.toLowerCase().includes(addSearch.trim().toLowerCase())
              )}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={async () => {
                  await set(ref(db, `members/${item.id}/Teams/${teamToAddTo}`), true);
                  setTeamsMap(prev => ({
                    ...prev,
                    [item.id]: [...(prev[item.id] || []), teamToAddTo],
                  }));
                  const teamName = teamsList.find(t => t.id === teamToAddTo)?.name || '';
                  Alert.alert(
                    'Member Added',
                    `${item.name} has been added to ${teamName}.`,
                    [{ text: 'OK', onPress: () => setShowAddModal(false) }]
                  );
                }}
              >
                <Text style={{ padding: 16 }}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
            ListEmptyComponent={
              <Text style={{ textAlign: 'center', marginTop: 20, color: '#888' }}>
                No members to add.
              </Text>
            }
          />
        </SafeAreaView>
      </Modal>
    )}

    {/* ─── Search Bar (everyone) ─── */}
    <TextInput
      style={[styles.input, { marginBottom: 12 }]}
      placeholder="Search..."
      placeholderTextColor="#666"
      value={searchText}
      onChangeText={text => {
        setSearchText(text);
        setCurrentPage(1);
      }}
    />

    {/* ─── Filter & Paginate ─── */}
    {(() => {
      // you already have displayedTeams, totalPages, etc.
      return (
        <>
          <FlatList
            data={displayedTeams}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const memberCount = members.filter(m =>
                teamsMap[m.id]?.includes(item.id)
              ).length;
              const expanded = expandedTeams.includes(item.id);

              return (
                <View style={styles.historyBlock}>
                  <TouchableOpacity
                    style={styles.historyHeader}
                    onPress={() => toggleTeamExpansion(item.id)}
                  >
                    <Text style={styles.historyDate}>
                      {item.name} ({memberCount})
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {/* CRUD icons only for admins */}
                      {isAdmin && (
                        <>
                          <Ionicons
                            name="add-circle-outline"
                            size={20}
                            color="#4CAF50"
                            onPress={() => {
                              setTeamToAddTo(item.id);
                              setShowAddModal(true);
                            }}
                            style={{ marginRight: 12 }}
                          />
                          <Ionicons
                            name="pencil"
                            size={20}
                            color="#888"
                            onPress={() => startRename(item.id, item.name)}
                            style={{ marginRight: 12 }}
                          />
                          <Ionicons
                            name="trash"
                            size={20}
                            color="#e33"
                            onPress={() => deleteTeam(item.id)}
                            style={{ marginRight: 12 }}
                          />
                        </>
                      )}
                      <Ionicons
                        name={expanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#333"
                      />
                    </View>
                  </TouchableOpacity>
                  {expanded &&
                    members
                      .filter(m => teamsMap[m.id]?.includes(item.id))
                      .map(m => (
                        <View key={m.id} style={styles.row}>
                          <Text style={styles.member}>{m.name}</Text>
                          {isAdmin && (
                            <TouchableOpacity
                              onPress={() => confirmRemoveFromTeam(m.id, item.id, item.name)}
                            >
                              <Text style={{ color: '#e33', fontWeight: '500' }}>
                                Remove
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No teams match your search.</Text>}
          />

          {/* Pagination (everyone) */}
          {filteredTeams.length > pageSize && (
            <View style={styles.pagination}>
              <Button
                title="Prev"
                disabled={currentPage <= 1}
                onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
              />
              <Text style={styles.pageInfo}>
                Page {currentPage} of {totalPages}
              </Text>
              <Button
                title="Next"
                disabled={currentPage >= totalPages}
                onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              />
            </View>
          )}
        </>
      );
    })()}
  </View>
)}

{/* History View */}
{viewMode === 'history' && (
  <View style={{ flex: 1, padding: 16 }}>
    {/* Search bar */}
    <TextInput
      style={styles.historySearch}
      placeholder="Search dates…"
      placeholderTextColor="#666"
      value={historySearch}
      onChangeText={text => {
        setHistorySearch(text);
        setCurrentHistoryPage(1);
      }}
    />

    {/* Filter & paginate */}
    {(() => {
      // 1) filter dateList by your historySearch
      const filteredDates = dateList.filter(dateKey => {
        const label = dateKey === todayKey ? 'Today' : formatKey(dateKey);
        return label
          .toLowerCase()
          .includes(historySearch.trim().toLowerCase());
      });

      // 2) total pages
      const totalHistoryPages = Math.max(
        1,
        Math.ceil(filteredDates.length / pageSize)
      );

      // 3) slice for current page
      const displayedDates = filteredDates.slice(
        (currentHistoryPage - 1) * pageSize,
        currentHistoryPage * pageSize
      );

      return (
        <>
          <FlatList
            data={displayedDates}
            keyExtractor={dk => dk}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item: dateKey }) => {
              const attForDay = allAttendance[dateKey] || {};
              const presentCount = members.filter(m => attForDay[m.id]).length;
              const pct = members.length
                ? Math.round((presentCount / members.length) * 100)
                : 0;
              const isExp = expandedDates.includes(dateKey);

              return (
                <View style={styles.historyBlock}>
                  <TouchableOpacity
                    style={styles.historyHeader}
                    onPress={() =>
                      setExpandedDates(ed =>
                        ed.includes(dateKey)
                          ? ed.filter(d => d !== dateKey)
                          : [...ed, dateKey]
                      )
                    }
                  >
                    <Text style={styles.historyDate}>
                      {dateKey === todayKey ? 'Today' : formatKey(dateKey)}{' '}
                      ({presentCount} present, {pct}%)
                    </Text>
                    <Ionicons
                      name={isExp ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color="#333"
                    />
                  </TouchableOpacity>

                  {isExp &&
                    members.map(m => {
                      const present = Boolean(attForDay[m.id]);
                      return (
                        <View key={m.id} style={styles.row}>
                          <Text style={styles.member}>{m.name}</Text>
                          <Text
                            style={
                              present
                                ? styles.presentText
                                : { color: '#e33', fontWeight: '500' }
                            }
                          >
                            {present ? 'Present' : 'Absent'}
                          </Text>
                        </View>
                      );
                    })}
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No attendance history</Text>
            }
          />

{/* ─── Pagination ─── */}
{filteredDates.length > pageSize && (
  <View style={styles.pagination}>
    <Button
      title="Prev"
      disabled={currentHistoryPage <= 1}
      onPress={() =>
        setCurrentHistoryPage(p => Math.max(1, p - 1))
      }
    />
    <Text style={styles.pageInfo}>
      Page {currentHistoryPage} of {totalHistoryPages}
    </Text>
    <Button
      title="Next"
      disabled={currentHistoryPage >= totalHistoryPages}
      onPress={() =>
        setCurrentHistoryPage(p => Math.min(totalHistoryPages, p + 1))
      }
    />
  </View>
)}
        </>
      );
    })()}
  </View>
)}

{/* Profile Modal */}
<Modal
  visible={!!profileMember}
  animationType="slide"
  onRequestClose={() => setProfileMember(null)}
>
  <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {profileMember && (() => {
        const isUsher = currentUserRole === 'usher';
        const lastDate = getLastAttendanceDate(profileMember.id);
        const lastAttended = lastDate ? formatKey(lastDate) : 'Never';
        const teamNames = (teamsMap[profileMember.id] || [])
          .map(id => teamsList.find(t => t.id === id)?.name)
          .filter(Boolean)
          .join(', ') || '–';

        return (
          <>
            {/* TITLE + NAME */}
            {profileMember.title ? (
              <Text style={[styles.heading, { marginBottom: 4 }]}>
                {profileMember.title}
              </Text>
            ) : null}
            <Text style={[styles.heading, { marginBottom: 16 }]}>
              {profileMember.firstName || ''}
              {profileMember.firstName && profileMember.lastName ? ' ' : ''}
              {profileMember.lastName || profileMember.name}
            </Text>

            {/* fields all users see */}
            <Text style={styles.profileText}> Office: {profileMember.office || '–'} </Text>
            <Text style={styles.profileText}> Age: {profileMember.age || '–'} </Text>
            <Text style={styles.profileText}> Gender: {profileMember.gender || '–'} </Text>
            <Text style={styles.profileText}> Birthday: {profileMember.birthday || '–'} </Text>
            <Text style={styles.profileText}> Department/Ministry: {teamNames} </Text>
            <Text style={styles.profileText}> Last Attended: {lastAttended} </Text>

            {/* only admins see these extra fields */}
            {!isUsher && (
              <>
                <Text style={styles.profileText}> Address: {profileMember.address || '–'} </Text>
                <Text style={styles.profileText}> Phone: {profileMember.phone || '–'} </Text>
                <Text style={styles.profileText}> Email: {profileMember.email || '–'} </Text>
                <Text style={styles.profileText}> Joined: {profileMember.joined ? formatKey(profileMember.joined) : '–'} </Text>
                <Text style={styles.profileText}> Attendance Rate: {getPct(profileMember.id, profileMember.joined)}% </Text>
                <Text style={styles.profileText}> Born Again: {profileMember.bornAgain ? 'Yes' : 'No'} </Text>
                <Text style={styles.profileText}> Baptised by Immersion: {profileMember.baptisedByImmersion ? 'Yes' : 'No'} </Text>
                <Text style={styles.profileText}> Holy Ghost Baptism: {profileMember.receivedHolyGhost ? 'Yes' : 'No'} </Text>
                <Text style={styles.profileText}> Member ID: {profileMember.id} </Text>
              </>
            )}
          </>
        );
      })()}

      <View style={{ marginTop: 24 }}>
        <Button title="Close" onPress={() => setProfileMember(null)} />
      </View>
    </ScrollView>
  </SafeAreaView>
</Modal>

<Modal
  visible={showRenameModal}
  animationType="slide"
  transparent
  onRequestClose={() => setShowRenameModal(false)}
>
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      <Text style={styles.modalTitle}>Rename</Text>

      <TextInput
        style={styles.input}
        placeholder="New Department/Ministry name"
        placeholderTextColor="#888"
        value={renameValue}
        onChangeText={setRenameValue}
      />

      <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:16 }}>
        <Button
          title="Cancel"
          onPress={() => setShowRenameModal(false)}
        />
        <View style={{ width:16 }}/>
        <Button
          title="OK"
          onPress={async () => {
            const newName = renameValue.trim();
            if (!newName) {
              Alert.alert('Validation','Please enter a Department/Ministry name.');
              return;
            }

            // 1) update the team’s name
            await set(ref(db, `teams/${renameTeamId}/name`), newName);

            // 2) update every member’s Teams/<teamId> label (if you need)
            members
              .filter(m => teamsMap[m.id]?.includes(renameTeamId))
              .forEach(m => {
                set(ref(db, `members/${m.id}/Teams/${renameTeamId}`), true);
              });

            // 3) reset modal state
            setShowRenameModal(false);
            setRenameTeamId(null);
            setRenameValue('');
          }}
        />
      </View>
    </View>
  </View>
</Modal>

{/* Edit Profile Modal */}
<Modal
  visible={!!editingMember}
  animationType="slide"
  onRequestClose={() => setEditingMember(null)}
>
  <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={[styles.heading, { textAlign: 'left' }]}>
        Edit Profile
      </Text>

      {/* Title */}
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        placeholder="Title (Mr/Mrs/Rev)"
        placeholderTextColor="#666"
        value={editFields.title || ''}
        onChangeText={v => setEditFields(f => ({ ...f, title: v }))}
      />

      {/* First & Last Name */}
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        placeholder="First Name"
        placeholderTextColor="#666"
        value={editFields.firstName || ''}
        onChangeText={v => setEditFields(f => ({ ...f, firstName: v }))}
      />
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        placeholder="Last Name"
        placeholderTextColor="#666"
        value={editFields.lastName || ''}
        onChangeText={v => setEditFields(f => ({ ...f, lastName: v }))}
      />

      {/* Office */}
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        placeholder="Office (Deacon, Elder, etc)"
        placeholderTextColor="#666"
        value={editFields.office || ''}
        onChangeText={v => setEditFields(f => ({ ...f, office: v }))}
      />

      {/* Other text fields */}
      {['birthday','age','address','phone','email','role','gender'].map(field => (
        <TextInput
          key={field}
          style={[styles.input, { marginTop: 8 }]}
          placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
          placeholderTextColor="#666"
          value={editFields[field] || ''}
          onChangeText={v => setEditFields(f => ({ ...f, [field]: v }))}
        />
      ))}

      {/* Admin‐only boolean switches */}
      {!isUsher && (
        <>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Are you born again?</Text>
            <Switch
              value={!!editFields.bornAgain}
              onValueChange={v => setEditFields(f => ({ ...f, bornAgain: v }))}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Baptised by immersion?</Text>
            <Switch
              value={!!editFields.baptisedByImmersion}
              onValueChange={v => setEditFields(f => ({ ...f, baptisedByImmersion: v }))}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Received Holy Ghost baptism?</Text>
            <Switch
              value={!!editFields.receivedHolyGhost}
              onValueChange={v => setEditFields(f => ({ ...f, receivedHolyGhost: v }))}
            />
          </View>
        </>
      )}

      {/* Cancel / Save buttons */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 20 }}>
        <Button
          title="Cancel"
          onPress={() => setEditingMember(null)}
        />
        <Button
          title="Save"
          onPress={saveEdits}
        />
      </View>
    </ScrollView>
  </SafeAreaView>
</Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      {flex:1,backgroundColor:'#f9f9f9'},
  segmentGrid:    {flexDirection:'row',flexWrap:'wrap',marginHorizontal:16,marginTop:60,marginBottom:8},
  gridBtn:        {width:'48%',marginHorizontal:'1%',marginBottom:8,paddingVertical:12,backgroundColor:'#eee',borderRadius:6,alignItems:'center'},
  gridBtnActive:  {backgroundColor:'#4CAF50'},
  gridText:       {color:'#333',fontWeight:'500'},
  gridTextActive: {color:'#fff'},

  heading:        {fontSize:20,fontWeight:'600',marginVertical:8,textAlign:'center'},
  summary:        {textAlign:'center',marginBottom:8,color:'#555'},
  profileText:    {fontSize:16,marginVertical:4},

  formRow:        {flexDirection:'row',alignItems:'center',marginHorizontal:16,marginBottom:12},
  // input:          {flex:1,borderColor:'#ccc',borderWidth:1,borderRadius:6,padding:10,marginRight:8,backgroundColor:'#fff', color: '#333'},
  search:         {marginHorizontal:16,borderColor:'#ccc',borderWidth:1,borderRadius:6,padding:10,backgroundColor:'#fff',marginBottom:12, color: '#333'},

  datePicker:         {marginBottom:12},
  dateListContainer:  {flexGrow:1,justifyContent:'center',paddingHorizontal:16},
  dateBtn:            {paddingVertical:6,paddingHorizontal:12,marginHorizontal:8,borderRadius:6,backgroundColor:'#eee',alignItems:'center'},
  dateBtnActive:      {backgroundColor:'#4CAF50'},
  dateBtnText:        {color:'#333'},
  dateBtnTextActive:  {color:'#fff',fontWeight:'600'},

  attHeader:      {marginHorizontal:16},
  shortcutRow:    {flexDirection:'row',justifyContent:'space-around',marginVertical:16},

  row:            {flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:12,marginHorizontal:16,marginVertical:4,backgroundColor:'#fff',borderRadius:6,shadowColor:'#000',shadowOpacity:0.05,shadowRadius:4,elevation:1},
  member:         {fontSize:16},
  presentText:    {color:'#4CAF50',fontWeight:'500'},

  memberActions:  {flexDirection:'row',alignItems:'center'},
  editBtn:        {backgroundColor:'#ffb300',paddingHorizontal:10,paddingVertical:6,borderRadius:4,marginRight:8},
  editBtnText:    {color:'#fff',fontWeight:'600'},
  viewBtn:        {backgroundColor:'#4CAF50',paddingHorizontal:12,paddingVertical:6,borderRadius:4,marginRight:8},
  viewBtnText:    {color:'#fff',fontWeight:'600'},

  groupPicker:    {flexDirection:'row',flexWrap:'wrap',flex:1,justifyContent:'flex-end'},
  groupBtn:       {paddingVertical:4,paddingHorizontal:8,marginHorizontal:4,marginVertical:2,borderRadius:4,backgroundColor:'#eee'},
  groupBtnActive: {backgroundColor:'#4CAF50'},
  groupText:      {fontSize:12,color:'#333'},
  groupTextActive:{color:'#fff'},

  historyBlock:   {marginVertical:4,marginHorizontal:16,backgroundColor:'#fff',borderRadius:6,overflow:'hidden',elevation:1},
  historyHeader:  {flexDirection:'row',justifyContent:'space-between',padding:12,backgroundColor:'#f0f0f0'},
  historyDate:    {fontSize:16,fontWeight:'500'},

  empty:          {textAlign:'center',marginTop:20,color:'#666'},
  pagination:     {flexDirection:'row',justifyContent:'center',alignItems:'center',margin:16},
  pageIndicator:  {marginHorizontal:16,fontSize:16},
  saveBtn:        {margin:16},

historyBlock:   { marginVertical:4, marginHorizontal:16, backgroundColor:'#fff', borderRadius:6, overflow:'hidden', elevation:1 },
historyHeader:  { flexDirection:'row', justifyContent:'space-between', padding:12, backgroundColor:'#f0f0f0' },
historyDate:    { fontSize:16, fontWeight:'500' },

historySearch: {
  marginHorizontal: 16,
  marginBottom: 12,
  height: 40,
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderWidth: 1,
  borderColor: '#ccc',
  borderRadius: 6,
  backgroundColor: '#fff',
  color: '#333',
},

  manageBtn: {
    position: 'absolute',
    top: 75,
    right: 16,
    zIndex: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#fff',
    color: '#333',
  },

  searchInput: {
    width: '90%',
    height: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: '#000',
  },

  addButton: {
    marginLeft: 12,
    color: '#4CAF50',
    fontSize: 16,
    marginBottom: 20,
  },

  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  profileHeading: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  profileText: {
    fontSize: 14,
    marginBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },

  removeText: {
    color: '#e33',
    fontWeight: '500',
  },

  presentText: {
    color: '#4CAF50',
    fontWeight: '500',
  },

  absentText: {
    color: '#e33',
    fontWeight: '500',
  },

  footer: {
    alignItems: 'center',
    marginTop: 200,
    backgroundColor: '#f9f9f9',
  },
  footerText: {
    fontSize: 12,
    color: '#888',
  },

  switchRow: {
    flexDirection: 'row',
    alignItems:    'center',
    justifyContent:'space-between',
    marginTop:     12,
  },
  switchLabel: {
    fontSize: 16,
  },

});