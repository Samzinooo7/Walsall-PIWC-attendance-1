// components/ExportButton.js
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React from 'react';
import { Alert, Button, Platform } from 'react-native';
import XLSX from 'xlsx';

export default function ExportButton({
  members,
  teamsList,
  allAttendance,
  dateList,
}) {
  // normalize teamsList into an array of { id, name, church }
  const teamsArray = Array.isArray(teamsList)
    ? teamsList
    : Object.entries(teamsList || {}).map(([id, t]) => ({ id, ...t }));

  // helper: look up each teamId in a member’s teams array → comma-joined names
  const getTeamNames = (m) => {
    if (typeof m.Team === 'string' && m.Team.trim()) {
      return m.Team;
    }
    return (m.teams || [])
      .map(teamId => teamsArray.find(t => t.id === teamId)?.name)
      .filter(Boolean)
      .join(', ');
  };

  const exportToExcel = async () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1) Per-date sheets (Present vs Absent)
      dateList.forEach((dateKey) => {
        const day     = allAttendance[dateKey] || {};
        const present = members.filter(m => day[m.id]).map(m => ({ Name: m.name }));
        const absent  = members.filter(m => !day[m.id]).map(m => ({ Name: m.name }));
        const maxRows = Math.max(present.length, absent.length);

        const rows = Array.from({ length: maxRows }, (_, i) => ({
          Present: present[i]?.Name || '',
          Absent : absent[i]?.Name  || '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows, {
          header: ['Present', 'Absent'],
          skipHeader: false,
        });
        XLSX.utils.book_append_sheet(wb, ws, dateKey);
      });

      // 2) Attendance summary sheet (no Teams column)
      const attendanceRows = members.map((m) => {
        const totalDays   = dateList.length;
        const presentDays = dateList.filter(d => allAttendance[d]?.[m.id]).length;
        const pct = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;
        return {
          Name:       m.name,
          Attendance: `${pct}%`,
        };
      });
      const wsAtt = XLSX.utils.json_to_sheet(attendanceRows, {
        header: ['Name', 'Attendance'],
        skipHeader: false,
      });
      XLSX.utils.book_append_sheet(wb, wsAtt, 'Attendance');

      // 3) Members detail sheet
      const memberRows = members.map((m) => ({
        Name:     m.name,
        Phone:    m.phone    || '',
        Email:    m.email    || '',
        Address:  m.address  || '',
        Gender:   m.gender   || '',
        Birthday: m.birthday || '',
        Role:     m.role     || '',
        Teams:    getTeamNames(m),
      }));
      const wsMem = XLSX.utils.json_to_sheet(memberRows, {
        header: ['Name','Phone','Email','Address','Gender','Birthday','Role','Teams'],
        skipHeader: false,
      });
      XLSX.utils.book_append_sheet(wb, wsMem, 'Members');

      // 4) Write and share
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
    } catch (e) {
      console.error(e);
      Alert.alert('Export failed', e.message);
    }
  };

  return <Button title="Export all data to Excel" onPress={exportToExcel} />;
}