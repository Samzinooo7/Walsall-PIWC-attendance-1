// MainApp.js
import { Ionicons } from '@expo/vector-icons';
import 'firebase/compat/auth';
import 'firebase/compat/database';
import { equalTo, onValue, orderByChild, push, query, ref, remove, set } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, db } from './firebaseConfig'; // compat versions

export default function MainApp({ navigation }) {
  // — Manage-Account state & handlers —
  const [showManage, setShowManage] = useState(false);
  const [currentUserChurch, setCurrentUserChurch] = useState(null);

  const onResetPassword = async () => {
    try {
      await auth.sendPasswordResetEmail(auth.currentUser.email);
      Alert.alert('Email sent', 'Check your inbox for reset instructions.');
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

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
  const [newName, setNewName]             = useState('');
  const [teamsMap, setTeamsMap]           = useState({});
  const [editingMember, setEditingMember] = useState(null);
  const [editFields, setEditFields]       = useState({});
  const [presentMap, setPresentMap]       = useState({});
  const [searchText, setSearchText]       = useState('');
  const [viewMode, setViewMode]           = useState('attendance');
  const [dateList, setDateList]           = useState([]);
  const [allAttendance, setAllAttendance] = useState({});
  const [selectedDate, setSelectedDate]   = useState(todayKey);
  const [expandedDates, setExpandedDates] = useState([]);
  const [currentPage, setCurrentPage]     = useState(1);
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

// 1) Load the current user’s church once on mount
useEffect(() => {
  const uid = auth.currentUser?.uid;
  if (!uid) return navigation.replace('Login');
  db.ref(`users/${uid}/church`)
    .once('value')
    .then(snap => setCurrentUserChurch(snap.val()))
    .catch(() => setCurrentUserChurch(null));
}, []);

  

// 2) Load only members in that church via an RTDB query,
//    and pull in a multi‐team list from m.Teams
useEffect(() => {
  if (!currentUserChurch) return;

  const membersQ = query(
    ref(db, 'members'),
    orderByChild('church'),
    equalTo(currentUserChurch)
  );

  // subscribe …
  const unsubscribe = onValue(membersQ, snapshot => {
    const data = snapshot.val() || {};

    // map each member node → our UI object
    const list = Object.entries(data).map(([id, m]) => ({
      id,
      name:     m.name             || '',
      birthday: m.Birthday         || '',
      address:  m.Address          || '',
      phone:    m['Phone Number']  || '',
      email:    m.Email            || '',
      role:     m.Role             || '',
      age:      m.Age              || '',
      joined:   m.Joined           || null,
      gender:   m.Gender           || '',
      // collect all team-IDs (keys under m.Teams), or empty array
      teams: Array.isArray(m.Teams)
      ? m.Teams
      : m.Teams
        ? Object.keys(m.Teams)
        : []
    }));

// 2) Update the members list
setMembers(list);

// 3) Rebuild your present-toggles map
setPresentMap(prev => {
  const updated = {};
  list.forEach(m => {
    updated[m.id] = prev[m.id] || false;
  });
  return updated;
});

// 4) Rebuild your multi-team lookup (teamsMap)
setTeamsMap(
  list.reduce((acc, m) => {
    acc[m.id] = m.teams;
    return acc;
  }, {})
);
});

return unsubscribe;
}, [currentUserChurch]);


// — Load attendance history —
useEffect(() => {
  const attRef = ref(db, 'attendance');
  const unsubscribe = onValue(attRef, snap => {
    const data = snap.val() || {};
    setAllAttendance(data);

    let keys = Object.keys(data).sort();
    if (!keys.includes(todayKey)) keys.unshift(todayKey);
    setDateList(keys);
    if (!keys.includes(selectedDate)) {
      setSelectedDate(todayKey);
    }
  });
  return () => unsubscribe();
}, [selectedDate]);

// — Subscribe to selected date —
useEffect(() => {
  const dayRef = ref(db, `attendance/${selectedDate}`);
  const unsubscribe = onValue(dayRef, snap => {
    const data = snap.val() || {};
    setPresentMap(pm =>
      Object.fromEntries(members.map(m => [m.id, Boolean(data[m.id])]))
    );
  });
  return () => unsubscribe();
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
  const name = newName.trim();
  if (!name) {
    return Alert.alert('Validation', 'Please enter a member name.');
  }

  // 1) create the new member node
  const newRef = push(ref(db, 'members'));
  const memberData = {
    name,
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

  setNewName('');
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

// deleteTeam: remove team and remove key from all members
const deleteTeam = id => {
  Alert.alert(
    'Delete team?',
    'This will remove the team from all members.',
    [
      { text:'Cancel', style:'cancel' },
      {
        text:'Delete',
        style:'destructive',
        onPress: async () => {
          // 1) Load team name
          const snap = await ref(db, `teams/${id}`).once('value');
          const teamName = snap.val()?.name;
          // 2) For every member under this church, remove that team key
          const membersSnap = await ref(db, 'members').once('value');
          const allMembers = membersSnap.val() || {};
          for (const [mid,mdata] of Object.entries(allMembers)) {
            if (mdata.church === currentUserChurch && mdata.Teams?.[id]) {
              await remove(ref(db, `members/${mid}/Teams/${id}`));
            }
          }
          // 3) Finally remove the team node itself
          await remove(ref(db, `teams/${id}`));
        }
      }
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

// 6) UI helper to pop a list of members *not yet* in that team:
const addMemberToTeamPrompt = teamId => {
  // filter out anyone who already has this teamId in their teamsMap
  const available = members.filter(
    m => !(teamsMap[m.id] || []).includes(teamId)
  );
  if (available.length === 0) {
    return Alert.alert('No one left to add');
  }

  Alert.alert(
    `Add to ${teamsList.find(t => t.id === teamId)?.name}`,
    null,
    [
      // one button per available member
      ...available.map(m => ({
        text: m.name,
        onPress: async () => {
          // 1) write to RTDB under members/{uid}/Teams/{teamId} = true
          await set(ref(db, `members/${m.id}/Teams/${teamId}`), true);
          
          // 2) update local multi-team lookup
          setTeamsMap(prev => ({
            ...prev,
            [m.id]: [...(prev[m.id] || []), teamId],
          }));
        }
      })),
      // Cancel button
      { text: 'Cancel', style: 'cancel' }
    ]
  );
};

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
 
  // — Filter & paginate —
  const filteredMembers = members.filter(m=>
    m.name.toLowerCase().includes(searchText.trim().toLowerCase())
  );
  const totalPages     = Math.max(1, Math.ceil(filteredMembers.length/pageSize));
  const displayedItems = filteredMembers.slice(
    (currentPage-1)*pageSize, currentPage*pageSize
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

  const renderMemberRow = ({ item }) => (
    <View style={styles.row}>
      <Text style={styles.member}>{item.name}</Text>
      <View style={styles.memberActions}>
        <TouchableOpacity style={styles.editBtn} onPress={()=>{
          setEditingMember(item.id);
          setEditFields({
            name: item.name,
            birthday: item.birthday,
            age: item.age,
            address: item.address,
            phone: item.phone,
            email: item.email,
            role: item.role,
            gender: item.gender,
            team: teams[item.id],
          });
        }}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.viewBtn} onPress={()=>setProfileMember(item)}>
          <Text style={styles.viewBtnText}>View</Text>
        </TouchableOpacity>
        <Ionicons name="trash" size={24} color="#e33" onPress={()=>deleteMember(item.id)} />
      </View>
    </View>
  );

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
              onPress={() => startRename(teamId, teamName)}
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
    const att   = allAttendance[dateKey]||{};
    return (
      <View style={styles.historyBlock}>
        <TouchableOpacity style={styles.historyHeader} onPress={()=>{
          setExpandedDates(ed =>
            ed.includes(dateKey) ? ed.filter(d=>d!==dateKey) : [...ed,dateKey]
          );
        }}>
          <Text style={styles.historyDate}>
            {dateKey===todayKey ? 'Today' : formatKey(dateKey)}
          </Text>
          <Ionicons name={isExp?'chevron-up':'chevron-down'} size={20} color="#333" />
        </TouchableOpacity>
        {isExp && members.map(m=>(
          <View key={m.id} style={styles.row}>
            <Text style={styles.member}>{m.name}</Text>
            <Ionicons
              name={att[m.id] ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={att[m.id] ? '#4CAF50' : '#888'}
            />
          </View>
        ))}
      </View>
    );
  };

  // Save edits back to Firebase
  async function saveEdits() {
    const id = editingMember;
    await db.ref(`members/${id}/name`).set(editFields.name);
    await db.ref(`members/${id}/Birthday`).set(editFields.birthday);
    await db.ref(`members/${id}/Age`).set(editFields.age);
    await db.ref(`members/${id}/Address`).set(editFields.address);
    await db.ref(`members/${id}/Phone Number`).set(editFields.phone);
    await db.ref(`members/${id}/Email`).set(editFields.email);
    await db.ref(`members/${id}/Role`).set(editFields.role);
    await db.ref(`members/${id}/Gender`).set(editFields.gender);
    await db.ref(`members/${id}/Team`).set(editFields.team);
    setEditingMember(null);
    setEditFields({});
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 2×2 Grid */}
      <View style={styles.segmentGrid}>
        {['attendance','members','groups','history'].map(mode => {
          const label = mode==='groups' ? 'Teams' : mode.charAt(0).toUpperCase()+mode.slice(1);
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
              style={styles.input}
              placeholder="Member name"
              value={newName}
              onChangeText={setNewName}
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

      {/* Manage Account Modal */}
      <Modal
        visible={showManage}
        transparent
        animationType="fade"
        onRequestClose={()=>setShowManage(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Manage Account</Text>
            <Button title="Reset Password" onPress={onResetPassword} />
            <View style={{ height:12 }} />
            <Button title="Log Out" color="red" onPress={onLogout} />
            <View style={{ height:12 }} />
            <Button title="Cancel" onPress={()=>setShowManage(false)} />
          </View>
        </View>
      </Modal>

      {/* Members View */}
      {viewMode==='members' && (
        <View style={{flex:1}}>
          <Text style={styles.heading}>Registered Members</Text>
          <TextInput
            style={styles.search}
            placeholder="Search members…"
            value={searchText}
            onChangeText={setSearchText}
          />
          <FlatList
            data={displayedItems}
            keyExtractor={i=>i.id}
            renderItem={renderMemberRow}
            ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
          />
        </View>
      )}

      {/* Teams View */}
      {viewMode==='groups' && (
        <View style={{flex:1, padding:16}}>
          <View style={{ flexDirection:'row', marginBottom:12 }}>
            <TextInput
              style={[styles.input,{ flex:1 }]}
              placeholder="New team name"
              value={newTeamName}
              onChangeText={setNewTeamName}
            />
            <Button title="Add" onPress={createTeam}/>
          </View>

          {/* Rename Team Modal */}
          <Modal
            visible={!!renamingId}
            transparent
            animationType="fade"
            onRequestClose={()=>setRenamingId(null)}
          >
            <View style={{
              flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'rgba(0,0,0,0.3)'
            }}>
              <View style={{
                width:'80%', padding:16, backgroundColor:'#fff', borderRadius:8
              }}>
                <Text style={{ marginBottom:8 }}>Rename team</Text>
                <TextInput
                  style={styles.input}
                  value={renamedName}
                  onChangeText={setRenamedName}
                />
                <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:12 }}>
                  <Button title="Cancel" onPress={()=>setRenamingId(null)}/>
                  <View style={{ width:12 }}/>
                  <Button title="OK" onPress={confirmRename}/>
                </View>
              </View>
            </View>
          </Modal>

          <FlatList
  data={teamsList}                              // <-- use the array of {id,name}
  keyExtractor={item => item.id}                // <-- stable unique key
  renderItem={({ item }) => (
    <View style={styles.historyBlock}>
      <TouchableOpacity
        style={styles.historyHeader}
        onPress={() => toggleTeamExpansion(item.id)}
      >
        <Text style={styles.historyDate}>
          {item.name} ({members.filter(m => teamsMap[m.id]?.includes(item.id)).length})
        </Text>
        <View style={{ flexDirection:'row', alignItems:'center' }}>
          <Ionicons
            name="add-circle-outline"
            size={20}
            color="#4CAF50"
            onPress={() => addMemberToTeamPrompt(item.id)}
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
          <Ionicons
            name={expandedTeams.includes(item.id) ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#333"
          />
        </View>
      </TouchableOpacity>

      {expandedTeams.includes(item.id) && (
        members
          .filter(m => teamsMap[m.id]?.includes(item.id))
          .map(m => (
            <View key={m.id} style={styles.row}>
              <Text style={styles.member}>{m.name}</Text>
              <TouchableOpacity
                onPress={() => removeMemberFromTeam(m.id, item.id)}
              >
                <Text style={{ color:'#e33', fontWeight:'500' }}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
      )}
    </View>
  )}
  ListEmptyComponent={<Text style={styles.empty}>No teams</Text>}
/>
        </View>
      )}

      {/* History View */}
      {viewMode==='history' && (
        <FlatList
          data={dateList}
          keyExtractor={k=>k}
          renderItem={renderHistoryItem}
          ListEmptyComponent={<Text style={styles.empty}>No history</Text>}
        />
      )}

{/* Profile Modal */}
<Modal
  visible={!!profileMember}
  animationType="slide"
  onRequestClose={() => setProfileMember(null)}
>
  <SafeAreaView style={styles.container}>
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {profileMember && (
        <>
          <Text style={[styles.heading, { textAlign: 'left' }]}>
            {profileMember.name}
          </Text>
          <Text style={styles.profileText}>
            Gender: {profileMember.gender || '–'}
          </Text>
          <Text style={styles.profileText}>
            Birthday: {profileMember.birthday || '–'}
          </Text>
          <Text style={styles.profileText}>
            Age: {profileMember.age || '–'}
          </Text>
          <Text style={styles.profileText}>
            Address: {profileMember.address || '–'}
          </Text>
          <Text style={styles.profileText}>
            Phone: {profileMember.phone || '–'}
          </Text>
          <Text style={styles.profileText}>
            Email: {profileMember.email || '–'}
          </Text>
          <Text style={styles.profileText}>
            Role: {profileMember.role || '–'}
          </Text>
          <Text style={styles.profileText}>
            Joined:{' '}
            {profileMember.joined
              ? formatKey(profileMember.joined)
              : '–'}
          </Text>

          {/* ← NEW: Multi-team display */}
          <Text style={styles.profileText}>
  Teams:{' '}
  {teamsMap[profileMember.id]?.length
    ? Array.from(new Set(teamsMap[profileMember.id]))
        .map(teamId => {
          const team = teamsList.find(t => t.id === teamId)
          return team ? team.name : '(unknown)'
        })
        .join(', ')
    : '–'}
</Text>

          <Text style={styles.profileText}>
            Last Attended:{' '}
            {(() => {
              const d = getLastAttendanceDate(profileMember.id)
              return d ? formatKey(d) : 'Never'
            })()}
          </Text>
          <Text style={[styles.profileText, { marginTop: 12 }]}>
            Attendance Rate:{' '}
            {getPct(profileMember.id, profileMember.joined)}%
          </Text>
        </>
      )}
      <View style={{ marginTop: 20 }}>
        <Button
          title="Close"
          onPress={() => setProfileMember(null)}
        />
      </View>
    </ScrollView>
  </SafeAreaView>
</Modal>

      {/* Edit Profile Modal */}
      <Modal visible={!!editingMember} animationType="slide" onRequestClose={()=>setEditingMember(null)}>
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={{padding:16}}>
            {/* <Text style={[styles.heading,{textAlign:'left'}]}>Edit Profile</Text> */}
            <Text> Teams: {profileMember?.teams?.length? profileMember.teams.join(', '): 'None'} </Text>
            {['name','birthday','age','address','phone','email','role','gender','team'].map(field=>(
              <TextInput
                key={field}
                style={styles.input}
                placeholder={field.charAt(0).toUpperCase()+field.slice(1)}
                value={editFields[field]||''}
                onChangeText={v=>setEditFields(f=>({...f,[field]:v}))}
              />
            ))}
            <View style={{flexDirection:'row',justifyContent:'space-around',marginTop:20}}>
              <Button title="Cancel" onPress={()=>setEditingMember(null)}/>
              <Button title="Save"   onPress={saveEdits}/>
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
  input:          {flex:1,borderColor:'#ccc',borderWidth:1,borderRadius:6,padding:10,marginRight:8,backgroundColor:'#fff'},
  search:         {marginHorizontal:16,borderColor:'#ccc',borderWidth:1,borderRadius:6,padding:10,backgroundColor:'#fff',marginBottom:12},

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

  manageBtn: {
    position: 'absolute',
    top: 45,
    right: 16,
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },

  removeText: {
    color: '#e33',
    fontWeight: '500',
  },
});