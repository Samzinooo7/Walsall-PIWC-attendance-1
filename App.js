import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    Button,
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

import { onValue, push, ref, remove, set } from 'firebase/database';
import { db } from './firebaseConfig';

export default function App() {
  // — Helpers & “today” key —————————————————————————————————
  function getOrdinal(n) {
    const s = ['th','st','nd','rd'], v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  }
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  const todayKey = `${yyyy}-${mm}-${dd}`;

  const formatKey = key => {
    if (!key) return '';
    const [y, m, d] = key.split('-').map(Number);
    const dt        = new Date(y, m - 1, d);
    const dayName   = dt.toLocaleDateString('en-GB',{ weekday:'long' });
    const monthName = dt.toLocaleDateString('en-GB',{ month:'long' });
    return `${dayName}, ${d}${getOrdinal(d)} ${monthName} ${y}`;
  };

  // — State —————————————————————————————————————————————————
  const [members, setMembers]           = useState([]);
  const [newName, setNewName]           = useState('');
  const [presentMap, setPresentMap]     = useState({});
  const [searchText, setSearchText]     = useState('');
  const [viewMode, setViewMode]         = useState('attendance');
  const [dateList, setDateList]         = useState([]);
  const [allAttendance, setAllAttendance] = useState({});
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [expandedDates, setExpandedDates] = useState([]);
  const [currentPage, setCurrentPage]   = useState(1);
  const pageSize = 20;

  const [groups, setGroups] = useState({});
  const categories = ['Member','Elder','Deacon','Deaconess'];

  // — Load members ————————————————————————————————————————
  useEffect(() => {
    const membersRef = ref(db, 'members');
    return onValue(membersRef, snap => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id,{name}]) => ({ id, name }));
      setMembers(list);
      setPresentMap(pm =>
        list.reduce((acc, m) => ({ ...acc, [m.id]: pm[m.id] ?? false }), {})
      );
      setGroups(g =>
        list.reduce((acc, m) => ({ ...acc, [m.id]: g[m.id] ?? 'Member' }), {})
      );
    });
  }, []);

  // — Load attendance history —————————————————————————————
  useEffect(() => {
    const attRoot = ref(db,'attendance');
    return onValue(attRoot, snap => {
      const data = snap.val() || {};
      setAllAttendance(data);
      const keys = Object.keys(data).sort();
      if (!keys.includes(todayKey)) keys.unshift(todayKey);
      setDateList(keys);
      if (!keys.includes(selectedDate)) setSelectedDate(todayKey);
    });
  }, []);

  // — Subscribe to selected date ——————————————————————————
  useEffect(() => {
    const attRef = ref(db, `attendance/${selectedDate}`);
    return onValue(attRef, snap => {
      const data = snap.val() || {};
      setPresentMap(pm =>
        Object.fromEntries(members.map(m => [m.id, Boolean(data[m.id])]))
      );
    });
  }, [members, selectedDate]);

  // — Counts —————————————————————————————————————
  const presentCount = members.filter(m => presentMap[m.id]).length;
  const absentCount  = members.length - presentCount;

  // — Handlers ————————————————————————————————————————
  const addMember = async () => {
    const name = newName.trim();
    if (!name) return Alert.alert('Validation','Please enter a member name.');
    try { await push(ref(db,'members'),{ name }); setNewName(''); }
    catch { Alert.alert('Error','Could not add member.'); }
  };

  const deleteMember = id => {
    Alert.alert('Confirm','Delete this member?',[
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async () => {
          try { await remove(ref(db,`members/${id}`)); }
          catch { Alert.alert('Error','Could not delete.'); }
        }}
    ]);
  };

  const togglePresent = id => {
    setPresentMap(pm => ({ ...pm, [id]: !pm[id] }));
  };

  const markAll = () => {
    setPresentMap(members.reduce((acc,m)=>({ ...acc, [m.id]: true }),{}));
  };
  const clearAll = () => {
    setPresentMap(members.reduce((acc,m)=>({ ...acc, [m.id]: false }),{}));
  };

  const saveAttendance = async () => {
    try {
      await set(ref(db,`attendance/${selectedDate}`),presentMap);
      Alert.alert('Saved',`Attendance for ${formatKey(selectedDate)} saved.`);
    } catch {
      Alert.alert('Error','Could not save attendance.');
    }
  };

  const assignGroup = (id, category) => {
    setGroups(g => ({ ...g, [id]: category }));
  };

  // — Filtering & Pagination ————————————————————————————
  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(searchText.trim().toLowerCase())
  );
  const totalPages     = Math.max(1, Math.ceil(filtered.length/pageSize));
  const displayedItems = filtered.slice(
    (currentPage-1)*pageSize,
    currentPage*pageSize
  );

  // — Renderers —————————————————————————————————————
  const renderMember = ({ item }) => {
    const { id, name } = item;
    if (viewMode==='attendance') {
      const pres = !!presentMap[id];
      return (
        <TouchableOpacity style={styles.row} onPress={()=>togglePresent(id)}>
          <Text style={[styles.member, pres&&styles.presentText]}>{name}</Text>
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
          <Text style={styles.member}>{name}</Text>
          <Ionicons name="trash" size={24} color="#e33" onPress={()=>deleteMember(id)} />
        </View>
      );
    }
    // groups
    return (
      <View style={styles.row}>
        <Text style={styles.member}>{name}</Text>
        <View style={styles.groupPicker}>
          {categories.map(cat => (
            <TouchableOpacity key={cat}
              style={[
                styles.groupBtn,
                groups[id]===cat && styles.groupBtnActive
              ]}
              onPress={()=>assignGroup(id,cat)}
            >
              <Text style={[
                styles.groupText,
                groups[id]===cat && styles.groupTextActive
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderHistoryItem = ({ item: dateKey }) => {
    const isExpanded = expandedDates.includes(dateKey);
    const attendance = allAttendance[dateKey] || {};
    return (
      <View style={styles.historyBlock}>
        <TouchableOpacity
          style={styles.historyHeader}
          onPress={() => {
            setExpandedDates(ed =>
              ed.includes(dateKey)
                ? ed.filter(d=>d!==dateKey)
                : [...ed, dateKey]
            );
          }}
        >
          <Text style={styles.historyDate}>
            {dateKey===todayKey? 'Today' : formatKey(dateKey)}
          </Text>
          <Ionicons
            name={isExpanded?'chevron-up':'chevron-down'}
            size={20}
            color="#333"
          />
        </TouchableOpacity>
        {isExpanded && members.map(m => (
          <View key={m.id} style={styles.row}>
            <Text style={styles.member}>{m.name}</Text>
            <Ionicons
              name={attendance[m.id]?'checkmark-circle':'ellipse-outline'}
              size={20}
              color={attendance[m.id]?'#4CAF50':'#888'}
            />
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* — Segment 2×2 Grid — */}
      <View style={styles.segmentGrid}>
        {['attendance','members','groups','history'].map(mode => {
          const label = mode.charAt(0).toUpperCase() + mode.slice(1);
          return (
            <TouchableOpacity
              key={mode}
              style={[
                styles.gridBtn,
                viewMode===mode && styles.gridBtnActive
              ]}
              onPress={()=>{
                setViewMode(mode);
                setCurrentPage(1);
              }}
            >
              <Text
                style={[
                  styles.gridText,
                  viewMode===mode && styles.gridTextActive
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {viewMode==='attendance' && (
        <View style={{flex:1}}>
          {/* Add */}
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

          {/* Dates */}
          <View style={styles.datePicker}>
            <FlatList
              data={dateList}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateListContainer}
              keyExtractor={k=>k}
              renderItem={({item:k})=>(
                <TouchableOpacity
                  style={[styles.dateBtn, k===selectedDate&&styles.dateBtnActive]}
                  onPress={()=>{ setSelectedDate(k); setCurrentPage(1); }}
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

          {/* Header */}
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

          {/* Search + List */}
          <TextInput
            style={styles.search}
            placeholder="Search members..."
            value={searchText}
            onChangeText={t=>{ setSearchText(t); setCurrentPage(1); }}
          />
          <FlatList
            data={displayedItems}
            keyExtractor={i=>i.id}
            renderItem={renderMember}
            ListEmptyComponent={<Text style={styles.empty}>No members</Text>}
          />
          {filtered.length > pageSize && (
            <View style={styles.pagination}>
              <Button
                title="Prev"
                disabled={currentPage<=1}
                onPress={()=>setCurrentPage(p=>Math.max(1,p-1))}
              />
              <Text style={styles.pageIndicator}>
                {currentPage} / {totalPages}
              </Text>
              <Button
                title="Next"
                disabled={currentPage>=totalPages}
                onPress={()=>setCurrentPage(p=>Math.min(totalPages,p+1))}
              />
            </View>
          )}
          <View style={styles.saveBtn}>
            <Button title="Save Attendance" onPress={saveAttendance}/>
          </View>
        </View>
      )}

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

      {viewMode==='history' && (
        <FlatList
          data={dateList}
          keyExtractor={k=>k}
          renderItem={renderHistoryItem}
          ListEmptyComponent={<Text style={styles.empty}>No history</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:            { flex:1, backgroundColor:'#f9f9f9' },

  // 2×2 grid styles
  segmentGrid:          {
    flexDirection:'row',
    flexWrap:'wrap',
    marginHorizontal:16,
    marginTop:12,
    marginBottom:8,
  },
  gridBtn:              {
    width:'48%',
    margin:'1%',
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

  formRow:              { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginBottom:12 },
  input:                { flex:1, borderColor:'#ccc', borderWidth:1, borderRadius:6, padding:10, marginRight:8, backgroundColor:'#fff' },

  datePicker:           { marginBottom:12 },
  dateListContainer:    { flexGrow:1, justifyContent:'center', paddingHorizontal:16 },
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