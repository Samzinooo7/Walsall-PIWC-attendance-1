// App.js
import { Ionicons } from '@expo/vector-icons';
import { onValue, push, ref, remove, set } from 'firebase/database';
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
import { db } from './firebaseConfig';

export default function App() {
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

  // For profile modal:
  const [profileMember, setProfileMember] = useState(null);

  // Teams CRUD
  const [teamsList, setTeamsList] = useState([]);     // [{ id, name }]
  const [newTeamName, setNewTeamName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renamedName, setRenamedName] = useState('')

  // — Load members (including Joined & Team) —
  useEffect(() => {
    const membersRef = ref(db, 'members');
    return onValue(membersRef, snap => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id,m]) => ({
        id,
        name:     m.name            || '',
        birthday: m.Birthday        || '',
        address:  m.Address         || '',
        phone:    m['Phone Number'] || '',
        role:     m.Role            || '',
        age:      m.Age             || '',
        joined:   m.Joined          || null,
        team:     m.Team            || 'Member',  // ← new Team field
      }));
      setMembers(list);
      setPresentMap(pm =>
        list.reduce((acc,m)=>( {...acc,[m.id]:pm[m.id]||false} ),{})
      );
      setTeams(t =>
        list.reduce((acc,m)=>( {...acc,[m.id]:m.team} ),{})
      );
    });
  }, []);

  // — Load attendance history —
  useEffect(() => {
    const attRef = ref(db, 'attendance');
    return onValue(attRef, snap => {
      const data = snap.val() || {};
      setAllAttendance(data);
      let keys = Object.keys(data).sort();
      if (!keys.includes(todayKey)) keys.unshift(todayKey);
      setDateList(keys);
      if (!keys.includes(selectedDate)) setSelectedDate(todayKey);
    });
  }, []);

  // — Subscribe to selected date —
  useEffect(() => {
    const attRef = ref(db, `attendance/${selectedDate}`);
    return onValue(attRef, snap => {
      const data = snap.val() || {};
      setPresentMap(pm =>
        Object.fromEntries(members.map(m=>[m.id, Boolean(data[m.id])]))
      );
    });
  }, [members, selectedDate]);

  // — Load canonical teams list —
  useEffect(()=>{
    const teamsRef = ref(db, 'teams');
    return onValue(teamsRef, snap=>{
      const data = snap.val()||{};
      setTeamsList(Object.entries(data).map(([id,{name}])=>({id,name})));
    });
  },[]);

  // — Attendance actions & counts —
  const presentCount = members.filter(m=>presentMap[m.id]).length;
  const absentCount  = members.length - presentCount;
  const markAll      = ()=> setPresentMap(members.reduce((acc,m)=>({...acc,[m.id]:true}),{}));
  const clearAll     = ()=> setPresentMap(members.reduce((acc,m)=>({...acc,[m.id]:false}),{}));
  const saveAttendance = async () => {
    await set(ref(db, `attendance/${selectedDate}`), presentMap);
    Alert.alert('Saved', `Attendance for ${formatKey(selectedDate)} saved.`);
  };

  // — Member CRUD & toggles —
// 1) In your App component, replace addMember with:

const addMember = async () => {
  const name = newName.trim();
  if (!name) {
    return Alert.alert('Validation','Please enter a member name.');
  }

  // create the member
  const newRef = push(ref(db, 'members'));
  await set(newRef, { name, Joined: todayKey, Team: 'Member' });
  const newId = newRef.key;

  // immediately mark them present today
  await set(ref(db, `attendance/${todayKey}/${newId}`), true);

  // update local toggle so UI shows them checked
  setPresentMap(pm => ({ ...pm, [newId]: true }));

  setNewName('');
};
  const deleteMember = id => {
    Alert.alert('Confirm','Delete this member?',[
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress:()=>remove(ref(db,`members/${id}`)) }
    ]);
  };
  const togglePresent = id => {
    setPresentMap(pm=>({...pm,[id]:!pm[id]}));
  };
  const assignTeam = (id, teamName) => {
    set(ref(db, `members/${id}/Team`), teamName);
    setTeams(prev=>({ ...prev, [id]: teamName }));
  };

  // — Teams CRUD handlers —
  const createTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return Alert.alert('Validation','Please enter a team name.');
    await push(ref(db,'teams'), { name });
    setNewTeamName('');
  };
  const deleteTeam = id => {
    Alert.alert('Delete team?', 'This will unassign all its members.',
    [
      { text:'Cancel', style:'cancel' },
          {
              text:'Delete', style:'destructive', onPress: async () => {
                // reset any members in that team to default:
                const teamName = teamsList.find(t=>t.id===id)?.name;
                members
                  .filter(m=>teams[m.id]===teamName)
                  .forEach(m=> set(ref(db,`members/${m.id}/Team`),'Member'));
                // remove the team record:
                await remove(ref(db,`teams/${id}`));
            }
          }
        ]
        );
    };
      const startRename = (id,name) => {
        setRenamingId(id);
        setRenamedName(name);
    };
      const confirmRename = async () => {
        if (!renamedName.trim()) return;
        await set(ref(db,`teams/${renamingId}/name`), renamedName.trim());
        // also update any members with old team name:
        const old = teamsList.find(t=>t.id===renamingId).name;
        members
          .filter(m=>teams[m.id]===old)
          .forEach(m=> set(ref(db,`members/${m.id}/Team`),renamedName.trim()));
        setRenamingId(null);
        setRenamedName('');
    };

    // Add member to a team
const addMemberToTeam = teamName => {
  // only show members not already in this team
  const available = members.filter(m => teams[m.id] !== teamName);
  if (available.length === 0) {
    return Alert.alert('No one left to add');
  }
  Alert.alert(
    `Add to ${teamName}`,
    null,
    available.map(m => ({
      text: m.name,
      onPress: () => assignTeam(m.id, teamName),
    }))
    .concat({ text: 'Cancel', style: 'cancel' })
  );
};

// Remove member from a team (reset to default “Member”)
const removeMemberFromTeam = memberId => {
  assignTeam(memberId, 'Member');
};

  // — Attendance % & last-attended helpers —
/**
 * Calculate attendance % only since the member joined.
 *
 * @param {string} id      — the member’s ID
 * @param {string} joined  — 'YYYY-MM-DD' the day they were added
 */
// 2) Replace your getPct helper with this:

function getPct(id, joined) {
  // only dates on or after they joined (and where attendance exists)
  const validDates = dateList.filter(
    d => d >= joined && allAttendance[d]
  );

  if (validDates.length === 0) {
    // no days in range → give 100%
    return 100;
  }

  const hits = validDates.filter(d => Boolean(allAttendance[d][id])).length;
  return Math.round((hits / validDates.length) * 100);
}
  const getLastAttendanceDate = id => {
    for (let i=dateList.length-1; i>=0; i--){
      const d = dateList[i];
      if (allAttendance[d]?.[id]) return d;
    }
    return null;
  };

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

  // — Renderers —
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
        <TouchableOpacity style={styles.viewBtn} onPress={()=>setProfileMember(item)}>
          <Text style={styles.viewBtnText}>View</Text>
        </TouchableOpacity>
        <Ionicons name="trash" size={24} color="#e33" onPress={()=>deleteMember(item.id)}  />
      </View>
    </View>
  );
  const renderTeam = ({ item: teamName }) => {
    const isExp = expandedTeams.includes(teamName);
    const membersInTeam = members.filter(m => teams[m.id] === teamName);
    const teamId = teamsList.find(t => t.name === teamName)?.id;
  
    return (
      <View style={styles.historyBlock}>
        <TouchableOpacity
          style={styles.historyHeader}
          onPress={() => {
            setExpandedTeams(e =>
              e.includes(teamName)
                ? e.filter(x => x !== teamName)
                : [...e, teamName]
            );
          }}
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
              onPress={() => addMemberToTeam(teamName)}
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
                    null,
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
                <Text style={{ color: '#e33', fontWeight: '500' }}>
                  Remove
                </Text>
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
          setExpandedDates(ed=>
            ed.includes(dateKey)
              ? ed.filter(d=>d!==dateKey)
              : [...ed,dateKey]
          );
        }}>
          <Text style={styles.historyDate}>
            {dateKey===todayKey?'Today':formatKey(dateKey)}
          </Text>
          <Ionicons name={isExp?'chevron-up':'chevron-down'} size={20} color="#333"/>
        </TouchableOpacity>
        {isExp && members.map(m=>(
          <View key={m.id} style={styles.row}>
            <Text style={styles.member}>{m.name}</Text>
            <Ionicons name={att[m.id]?'checkmark-circle':'ellipse-outline'} size={20}
              color={att[m.id]?'#4CAF50':'#888'}/>
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 2×2 Grid */}
      <View style={styles.segmentGrid}>
        {['attendance','members','groups','history'].map(mode=>{
          const label = mode==='groups' ? 'Teams' : mode.charAt(0).toUpperCase()+mode.slice(1);
          return (
            <TouchableOpacity key={mode}
              style={[styles.gridBtn, viewMode===mode&&styles.gridBtnActive]}
              onPress={()=>{ setViewMode(mode); setCurrentPage(1); }}
            >
              <Text style={[styles.gridText, viewMode===mode&&styles.gridTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Attendance (unchanged) */}
      {viewMode==='attendance' && (
        <View style={{flex:1}}>
          <Text style={styles.heading}>Add a new member</Text>
          <View style={styles.formRow}>
            <TextInput style={styles.input}
              placeholder="Member name"
              value={newName}
              onChangeText={setNewName}
            />
            <Button title="Add" onPress={addMember}/>
          </View>
          <View style={styles.datePicker}>
            <FlatList
              data={dateList}
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateListContainer}
              keyExtractor={k=>k}
              renderItem={({item:k})=>(
                <TouchableOpacity style={[styles.dateBtn, k===selectedDate&&styles.dateBtnActive]} onPress={()=>{setSelectedDate(k);setCurrentPage(1);}}>
                  <Text style={[styles.dateBtnText, k===selectedDate&&styles.dateBtnTextActive]}>
                    {k===todayKey?'Today':formatKey(k)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
          <View style={styles.attHeader}>
            <Text style={styles.heading}>Attendance for {formatKey(selectedDate)}</Text>
            <Text style={styles.summary}>Present: {presentCount} | Absent: {absentCount}</Text>
            <View style={styles.shortcutRow}>
              <Button title="Mark All" onPress={markAll}/>
              <Button title="Clear All" color="#888" onPress={clearAll}/>
            </View>
          </View>
          <TextInput style={styles.search}
            placeholder="Search members…"
            value={searchText}
            onChangeText={t=>{setSearchText(t);setCurrentPage(1);}}
          />
          <FlatList
            data={displayedItems}
            keyExtractor={i=>i.id}
            renderItem={renderAttendanceMember}
            ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
          />
          {/* pagination + save… */}
          {filteredMembers.length>pageSize && (
            <View style={styles.pagination}>
              <Button title="Prev" disabled={currentPage<=1} onPress={()=>setCurrentPage(p=>Math.max(1,p-1))}/>
              <Text style={styles.pageIndicator}>{currentPage}/{totalPages}</Text>
              <Button title="Next" disabled={currentPage>=totalPages} onPress={()=>setCurrentPage(p=>Math.min(totalPages,p+1))}/>
            </View>
          )}
          <View style={styles.saveBtn}><Button title="Save Attendance" onPress={saveAttendance}/></View>
        </View>
      )}

      {/* Members (unchanged) */}
      {viewMode==='members' && (
        <View style={{flex:1}}>
          <Text style={styles.heading}>Registered Members</Text>
          <TextInput style={styles.search}
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

      {/* Teams (new): list of teams, each expandable to its members */}
      {viewMode==='groups' && (
        <View style={{flex:1, padding:16}}>
          {/* — Create Team — */}
          <View style={{ flexDirection:'row', marginBottom:12 }}>
            <TextInput
              style={[styles.input,{ flex:1 }]}              placeholder="New team name"
              value={newTeamName}
              onChangeText={setNewTeamName}
            />
            <Button title="Add" onPress={createTeam}/>
          </View>

          {/* — Rename Modal — */}
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
                width:'80%', padding:16, backgroundColor:'#fff',
                borderRadius:8
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
            data={uniqueTeams}
            keyExtractor={t=>t}
            renderItem={renderTeam}
            ListEmptyComponent={<Text style={styles.empty}>No teams</Text>}
          />
        </View>
      )}

      {/* History (unchanged) */}
      {viewMode==='history' && (
        <FlatList
          data={dateList}
          keyExtractor={k=>k}
          renderItem={renderHistoryItem}
          ListEmptyComponent={<Text style={styles.empty}>No history</Text>}
        />
      )}

      {/* Profile Modal (added team display) */}
      <Modal visible={!!profileMember} animationType="slide" onRequestClose={()=>setProfileMember(null)}>
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={{padding:16}}>
            {profileMember && (
              <>
                <Text style={[styles.heading,{textAlign:'left'}]}>{profileMember.name}</Text>
                <Text style={styles.profileText}>Birthday: {profileMember.birthday||'–'}</Text>
                <Text style={styles.profileText}>Age: {profileMember.age||'–'}</Text>
                <Text style={styles.profileText}>Address: {profileMember.address||'–'}</Text>
                <Text style={styles.profileText}>Phone: {profileMember.phone||'–'}</Text>
                <Text style={styles.profileText}>Role: {profileMember.role||'–'}</Text>
                <Text style={styles.profileText}>Joined: {profileMember.joined?formatKey(profileMember.joined):'–'}</Text>
                <Text style={styles.profileText}>Team: {teams[profileMember.id]||'–'}</Text>
                <Text style={styles.profileText}>
                  Last Attended: {
                    (() => {
                      const d=getLastAttendanceDate(profileMember.id);
                      return d?formatKey(d):'Never';
                    })()
                  }
                </Text>
                <Text style={[styles.profileText,{marginTop:12}]}>
                Attendance Rate: {getPct(profileMember.id, profileMember.joined)}%
                </Text>
              </>
            )}
            <View style={{marginTop:20}}>
              <Button title="Close" onPress={()=>setProfileMember(null)}/>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      {flex:1,backgroundColor:'#f9f9f9'},
  segmentGrid:    {flexDirection:'row',flexWrap:'wrap',marginHorizontal:16,marginTop:12,marginBottom:8},
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
});