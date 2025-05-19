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
  const mm    = String(today.getMonth()+1).padStart(2,'0');
  const dd    = String(today.getDate()).padStart(2,'0');
  const todayKey = `${yyyy}-${mm}-${dd}`;

  const formatKey = key => {
    if (!key) return '';
    const [y,m,d] = key.split('-').map(Number);
    const dt = new Date(y,m-1,d);
    const dayName   = dt.toLocaleDateString('en-GB',{ weekday:'long' });
    const monthName = dt.toLocaleDateString('en-GB',{ month:'long' });
    return `${dayName}, ${d}${getOrdinal(d)} ${monthName} ${y}`;
  };

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

  const [groups, setGroups] = useState({});
  const categories = ['Member','Elder','Deacon','Deaconess'];

  // for profile modal
  const [profileMember, setProfileMember] = useState(null);

  // — Load members (including joined) —
  useEffect(() => {
    const membersRef = ref(db,'members');
    return onValue(membersRef, snap => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id,m]) => ({
        id,
        name:     m.name      || '',
        birthday: m.Birthday  || '',
        address:  m.Address   || '',
        phone:    m['Phone Number'] || '',
        role:     m.Role      || '',
        age:      m.Age       || '',
        joined:   m.Joined    || null,      // ← load joined
      }));
      setMembers(list);
      setPresentMap(pm =>
        list.reduce((acc,m)=>({...acc,[m.id]:pm[m.id]||false}),{})
      );
      setGroups(g =>
        list.reduce((acc,m)=>({...acc,[m.id]:g[m.id]||'Member'}),{})
      );
    });
  },[]);

  // — Load attendance history —
  useEffect(() => {
    const attRef = ref(db,'attendance');
    return onValue(attRef, snap => {
      const data = snap.val() || {};
      setAllAttendance(data);
      let keys = Object.keys(data).sort();
      if (!keys.includes(todayKey)) keys.unshift(todayKey);
      setDateList(keys);
      if (!keys.includes(selectedDate)) setSelectedDate(todayKey);
    });
  },[]);

  // — Subscribe to selected Date —
  useEffect(() => {
    const attRef = ref(db,`attendance/${selectedDate}`);
    return onValue(attRef, snap => {
      const data = snap.val() || {};
      setPresentMap(pm =>
        Object.fromEntries(members.map(m=>[m.id,Boolean(data[m.id])]))
      );
    });
  },[members,selectedDate]);

  // — Counts —
  const presentCount = members.filter(m=>presentMap[m.id]).length;
  const absentCount  = members.length - presentCount;

  // — Handlers —
  const addMember = async () => {
    const name = newName.trim();
    if (!name) return Alert.alert('Validation','Enter a member name.');
    await push(ref(db,'members'),{ 
      name, 
      joined: todayKey           // ← stamp joined
    });
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
  const markAll = ()=> setPresentMap(members.reduce((acc,m)=>({...acc,[m.id]:true}),{}));
  const clearAll= ()=> setPresentMap(members.reduce((acc,m)=>({...acc,[m.id]:false}),{}));
  const saveAttendance = async () => {
    await set(ref(db,`attendance/${selectedDate}`),presentMap);
    Alert.alert('Saved',`Attendance for ${formatKey(selectedDate)} saved.`);
  };
  const assignGroup = (id,cat)=>setGroups(g=>({...g,[id]:cat}));

  // — Attendance % helper —
  const getPct = id => {
    const days = dateList.filter(d=>allAttendance[d]);
    if (!days.length) return 0;
    const hits = days.filter(d=>allAttendance[d][id]).length;
    return Math.round(100*hits/days.length);
  };

  // — Last-attended helper —
  const getLastAttendanceDate = id => {
    // walk dates newest → oldest
    for (let i=dateList.length-1; i>=0; i--) {
      const d = dateList[i];
      if (allAttendance[d]?.[id]) {
        return d;
      }
    }
    return null;
  };

  // — Filter & paginate —
  const filtered = members.filter(m=>
    m.name.toLowerCase().includes(searchText.trim().toLowerCase())
  );
  const totalPages     = Math.max(1,Math.ceil(filtered.length/pageSize));
  const displayedItems = filtered.slice(
    (currentPage-1)*pageSize, currentPage*pageSize
  );

  // — Renderers —
  const renderMember = ({item}) => {
    if (viewMode==='attendance') {
      const pres = presentMap[item.id];
      return (
        <TouchableOpacity style={styles.row}
          onPress={()=>togglePresent(item.id)}
        >
          <Text style={[styles.member,pres&&styles.presentText]}>
            {item.name}
          </Text>
          <Ionicons
            name={pres?'checkmark-circle':'ellipse-outline'}
            size={24} color={pres?'#4CAF50':'#888'}
          />
        </TouchableOpacity>
      );
    }
    if (viewMode==='members') {
      return (
        <View style={styles.row}>
          <Text style={styles.member}>{item.name}</Text>
          <View style={styles.memberActions}>
            <TouchableOpacity
              style={styles.viewBtn}
              onPress={()=>setProfileMember(item)}
            >
              <Text style={styles.viewBtnText}>View</Text>
            </TouchableOpacity>
            <Ionicons
              name="trash"
              size={24}
              color="#e33"
              onPress={()=>deleteMember(item.id)}
            />
          </View>
        </View>
      );
    }
    // groups...
    return (
      <View style={styles.row}>
        <Text style={styles.member}>{item.name}</Text>
        <View style={styles.groupPicker}>
          {categories.map(cat=>(
            <TouchableOpacity key={cat}
              style={[
                styles.groupBtn,
                groups[item.id]===cat && styles.groupBtnActive
              ]}
              onPress={()=>assignGroup(item.id,cat)}
            >
              <Text style={[
                styles.groupText,
                groups[item.id]===cat && styles.groupTextActive
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderHistoryItem = ({item:dateKey}) => {
    const isExp = expandedDates.includes(dateKey);
    const att   = allAttendance[dateKey]||{};
    return (
      <View style={styles.historyBlock}>
        <TouchableOpacity style={styles.historyHeader}
          onPress={()=>{
            setExpandedDates(ed=>
              ed.includes(dateKey)
                ? ed.filter(d=>d!==dateKey)
                : [...ed,dateKey]
            );
          }}
        >
          <Text style={styles.historyDate}>
            {dateKey===todayKey?'Today':formatKey(dateKey)}
          </Text>
          <Ionicons
            name={isExp?'chevron-up':'chevron-down'}
            size={20} color="#333"
          />
        </TouchableOpacity>
        {isExp && members.map(m=>(
          <View key={m.id} style={styles.row}>
            <Text style={styles.member}>{m.name}</Text>
            <Ionicons
              name={att[m.id]?'checkmark-circle':'ellipse-outline'}
              size={20} color={att[m.id]?'#4CAF50':'#888'}
            />
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* — 2×2 Segment Grid — */}
      <View style={styles.segmentGrid}>
        {['attendance','members','groups','history'].map(mode=>{
          const label = mode.charAt(0).toUpperCase()+mode.slice(1);
          return (
            <TouchableOpacity key={mode}
              style={[
                styles.gridBtn,
                viewMode===mode&&styles.gridBtnActive
              ]}
              onPress={()=>{
                setViewMode(mode);
                setCurrentPage(1);
              }}
            >
              <Text style={[
                styles.gridText,
                viewMode===mode&&styles.gridTextActive
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* — Attendance View — */}
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
              horizontal showsHorizontalScrollIndicator={false}
              keyExtractor={k=>k}
              renderItem={({item:k})=>(
                <TouchableOpacity
                  style={[styles.dateBtn, k===selectedDate&&styles.dateBtnActive]}
                  onPress={()=>{setSelectedDate(k);setCurrentPage(1);}}
                >
                  <Text style={[
                    styles.dateBtnText,
                    k===selectedDate&&styles.dateBtnTextActive
                  ]}>
                    {k===todayKey?'Today':formatKey(k)}
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
            placeholder="Search members..."
            value={searchText}
            onChangeText={t=>{setSearchText(t);setCurrentPage(1);}}
          />
          <FlatList
            data={displayedItems}
            keyExtractor={i=>i.id}
            renderItem={renderMember}
            ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
          />

          {filtered.length>pageSize && (
            <View style={styles.pagination}>
              <Button title="Prev" disabled={currentPage<=1}
                onPress={()=>setCurrentPage(p=>Math.max(1,p-1))}/>
              <Text style={styles.pageIndicator}>
                {currentPage} / {totalPages}
              </Text>
              <Button title="Next" disabled={currentPage>=totalPages}
                onPress={()=>setCurrentPage(p=>Math.min(totalPages,p+1))}/>
            </View>
          )}

          <View style={styles.saveBtn}>
            <Button title="Save Attendance" onPress={saveAttendance}/>
          </View>
        </View>
      )}

      {/* — Members View — */}
      {viewMode==='members' && (
        <View style={{flex:1}}>
          <Text style={styles.heading}>Registered Members</Text>
          <TextInput
            style={styles.search}
            placeholder="Search members..."
            value={searchText}
            onChangeText={setSearchText}
          />
          <FlatList
            data={displayedItems}
            keyExtractor={i=>i.id}
            renderItem={renderMember}
            ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
          />
        </View>
      )}

      {/* — Groups View — */}
      {viewMode==='groups' && (
        <View style={{flex:1}}>
          <Text style={styles.heading}>Group Assignments</Text>
          <TextInput
            style={styles.search}
            placeholder="Search members..."
            value={searchText}
            onChangeText={setSearchText}
          />
          <FlatList
            data={displayedItems}
            keyExtractor={i=>i.id}
            renderItem={renderMember}
            ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
          />
        </View>
      )}

      {/* — History View — */}
      {viewMode==='history' && (
        <FlatList
          data={dateList}
          keyExtractor={k=>k}
          renderItem={renderHistoryItem}
          ListEmptyComponent={<Text style={styles.empty}>No history</Text>}
        />
      )}

      {/* — Profile Modal — */}
      <Modal
        visible={!!profileMember}
        animationType="slide"
        onRequestClose={()=>setProfileMember(null)}
      >
        <SafeAreaView style={styles.container}>
          <ScrollView contentContainerStyle={{ padding:16 }}>
            {profileMember && (
              <>
                <Text style={[styles.heading,{ textAlign:'left' }]}>
                  {profileMember.name}
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
                  Role: {profileMember.role || '–'}
                </Text>
                {/* ← Joined line */}
                <Text style={styles.profileText}>
                  Joined: {profileMember.joined ? formatKey(profileMember.joined) : '–'}
                </Text>
                {/* ← Last attended */}
                <Text style={styles.profileText}>
                  Last Attended:{' '}
                  {(() => {
                    const d = getLastAttendanceDate(profileMember.id);
                    return d ? formatKey(d) : 'Never';
                  })()}
                </Text>
                <Text style={[styles.profileText,{ marginTop:12 }]}>
                  Attendance Rate: {getPct(profileMember.id)}%
                </Text>
              </>
            )}
            <View style={{ marginTop:20 }}>
              <Button title="Close" onPress={()=>setProfileMember(null)} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:            { flex:1, backgroundColor:'#f9f9f9' },

  // 2×2 grid
  segmentGrid:          {
    flexDirection:'row',
    flexWrap:'wrap',
    marginHorizontal:16,
    marginTop:12,
    marginBottom:8,
  },
  gridBtn:              {
    width:'48%',
    marginHorizontal:'1%',
    marginBottom:8,
    paddingVertical:12,
    backgroundColor:'#eee',
    borderRadius:6,
    alignItems:'center',
  },
  gridBtnActive:        { backgroundColor:'#4CAF50' },
  gridText:             { color:'#333', fontWeight:'500' },
  gridTextActive:       { color:'#fff' },

  heading:              { fontSize:20, fontWeight:'600', marginVertical:8, textAlign:'center' },
  summary:              { textAlign:'center', marginBottom:8, color:'#555' },
  profileText:          { fontSize:16, marginVertical:4 },

  formRow:              { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginBottom:12 },
  input:                { flex:1, borderColor:'#ccc', borderWidth:1, borderRadius:6, padding:10, marginRight:8, backgroundColor:'#fff' },

  datePicker:           { marginBottom:12 },
  dateBtn:              { paddingVertical:6, paddingHorizontal:12, marginHorizontal:8, borderRadius:6, backgroundColor:'#eee' },
  dateBtnActive:        { backgroundColor:'#4CAF50' },
  dateBtnText:          { color:'#333' },
  dateBtnTextActive:    { color:'#fff', fontWeight:'600' },

  attHeader:            { marginHorizontal:16 },
  shortcutRow:          { flexDirection:'row', justifyContent:'space-around', marginVertical:16 },
  search:               { marginHorizontal:16, borderColor:'#ccc', borderWidth:1, borderRadius:6, padding:10, backgroundColor:'#fff', marginBottom:12 },

  row:                  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12, marginHorizontal:16, marginVertical:4, backgroundColor:'#fff', borderRadius:6, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4, elevation:1 },
  member:               { fontSize:16 },
  presentText:          { color:'#4CAF50', fontWeight:'500' },

  memberActions:       { flexDirection:'row', alignItems:'center' },
  viewBtn:             { backgroundColor:'#4CAF50', paddingHorizontal:12, paddingVertical:6, borderRadius:4, marginRight:8 },
  viewBtnText:         { color:'#fff', fontWeight:'600' },

  groupPicker:          { flexDirection:'row', flexWrap:'wrap', flex:1, justifyContent:'flex-end' },
  groupBtn:             { paddingVertical:4, paddingHorizontal:8, marginHorizontal:4, marginVertical:2, borderRadius:4, backgroundColor:'#eee' },
  groupBtnActive:       { backgroundColor:'#4CAF50' },
  groupText:            { fontSize:12, color:'#333' },
  groupTextActive:      { color:'#fff' },

  historyBlock:         { marginVertical:4, marginHorizontal:16, backgroundColor:'#fff', borderRadius:6, overflow:'hidden', elevation:1 },
  historyHeader:        { flexDirection:'row', justifyContent:'space-between', padding:12, backgroundColor:'#f0f0f0' },
  historyDate:          { fontSize:16, fontWeight:'500' },

  empty:                { textAlign:'center', marginTop:20, color:'#666' },
  pagination:           { flexDirection:'row', justifyContent:'center', alignItems:'center', margin:16 },
  pageIndicator:        { marginHorizontal:16, fontSize:16 },
  saveBtn:              { margin:16 },
});