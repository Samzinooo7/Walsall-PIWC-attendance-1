// components/ExportButton.js
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { Alert, Button, Platform } from 'react-native';
import XLSX from 'xlsx';

export default function ExportButton({
  members,      // each member has { id, name, phone, email, address, gender, birthday, role, teams: [teamId,…] }
  teamsList,    // object or array of { id, name, … }
  allAttendance,// { [dateKey]: { [memberId]: true|false } }
  dateList,     // [ '2025-05-18', '2025-05-19', … ]
}) {
  // normalize teamsList → array of { id, name, … }
  const teamsArray = Array.isArray(teamsList)
    ? teamsList
    : Object.entries(teamsList || {}).map(([id, t]) => ({ id, ...t }));

  // lookup helper
  const getTeamNames = m =>
    (m.teams || [])
      .map(teamId => teamsArray.find(t => t.id === teamId)?.name)
      .filter(Boolean)
      .join(', ');

  // build+share workbook given three flags
  const exportWith = async ({ daily, summary, membersOnly }) => {
    const wb = XLSX.utils.book_new();

    // 1) daily sheets
    if (daily) {
      dateList.forEach(dateKey => {
        const day     = allAttendance[dateKey] || {};
        const present = members.filter(m => day[m.id]).map(m => ({ Name: m.name }));
        const absent  = members.filter(m => !day[m.id]).map(m => ({ Name: m.name }));
        const maxRows = Math.max(present.length, absent.length);
        const rows    = Array.from({ length: maxRows }, (_, i) => ({
          Present: present[i]?.Name || '',
          Absent : absent[i]?.Name  || '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows, {
          header: ['Present','Absent'],
          skipHeader: false,
        });
        XLSX.utils.book_append_sheet(wb, ws, dateKey);
      });
    }

    // 2) attendance summary
    if (summary) {
      const rows = members.map(m => {
        const total   = dateList.length;
        const present = dateList.filter(d => allAttendance[d]?.[m.id]).length;
        const pct     = total ? Math.round((present/total)*100) : 0;
        return { Name: m.name, Attendance: `${pct}%` };
      });
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ['Name','Attendance'],
        skipHeader: false,
      });
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Summary');
    }

    // 3) members detail
    if (membersOnly) {
      const rows = members.map(m => ({
        Name:     m.name,
        Phone:    m.phone    || '',
        Email:    m.email    || '',
        Address:  m.address  || '',
        Gender:   m.gender   || '',
        Birthday: m.birthday || '',
        Role:     m.role     || '',
        Teams:    getTeamNames(m),
      }));
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: ['Name','Phone','Email','Address','Gender','Birthday','Role','Teams'],
        skipHeader: false,
      });
      XLSX.utils.book_append_sheet(wb, ws, 'Members');
    }

    // write + share
    const wbout = XLSX.write(wb, { type:'base64', bookType:'xlsx' });
    const path  = `${FileSystem.cacheDirectory}church-data.xlsx`;
    await FileSystem.writeAsStringAsync(path, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (Platform.OS === 'web') {
      Alert.alert('Export ready','Download church-data.xlsx from cache.');
    } else {
      await Sharing.shareAsync(path, {
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle:'Share church-data.xlsx',
      });
    }
  };

  // show the option dialog
  const showOptions = () => {
    Alert.alert(
      'Export Options',
      'Which sheets would you like?',
      [
        {
          text: 'Daily Sheets Only',
          onPress: () => exportWith({ daily: true, summary: false, membersOnly: false }),
        },
        {
          text: 'Attendance Summary Only',
          onPress: () => exportWith({ daily: false, summary: true, membersOnly: false }),
        },
        {
          text: 'Members Only',
          onPress: () => exportWith({ daily: false, summary: false, membersOnly: true }),
        },
        {
          text: 'Everything',
          onPress: () => exportWith({ daily: true, summary: true, membersOnly: true }),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return <Button title="Export data to Excel" onPress={showOptions} />;
}