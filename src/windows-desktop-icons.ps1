$ErrorActionPreference = 'Stop'

$operation = [string]$env:YANJI_DESKTOP_ICON_OPERATION
$snapshot = [string]$env:YANJI_DESKTOP_ICON_SNAPSHOT
$childHandle = if ($env:YANJI_DESKTOP_CHILD_HANDLE) { [UInt64]::Parse($env:YANJI_DESKTOP_CHILD_HANDLE) } else { [UInt64]0 }

$source = @'
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;

public static class YanjiDesktopIcons {
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  private struct POINT { public int X, Y; }

  [StructLayout(LayoutKind.Sequential)]
  private struct RECT { public int Left, Top, Right, Bottom; }

  [DllImport("user32.dll")]
  private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string title);

  [DllImport("user32.dll")]
  private static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  private static extern bool GetClientRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  private static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr VirtualAllocEx(IntPtr process, IntPtr address, UIntPtr size, uint allocationType, uint protection);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool VirtualFreeEx(IntPtr process, IntPtr address, UIntPtr size, uint freeType);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr bytesRead);

  [DllImport("kernel32.dll")]
  private static extern bool CloseHandle(IntPtr handle);

  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
  private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int index);

  [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
  private static extern IntPtr GetWindowLong32(IntPtr hWnd, int index);

  private const uint LVM_FIRST = 0x1000;
  private const uint LVM_GETITEMCOUNT = LVM_FIRST + 4;
  private const uint LVM_SETITEMPOSITION = LVM_FIRST + 15;
  private const uint LVM_GETITEMPOSITION = LVM_FIRST + 16;
  private const uint LVM_GETITEMSPACING = LVM_FIRST + 51;
  private const long LVS_AUTOARRANGE = 0x0100L;

  private static IntPtr DesktopListView() {
    IntPtr list = IntPtr.Zero;
    EnumWindows(delegate(IntPtr candidate, IntPtr state) {
      IntPtr view = FindWindowEx(candidate, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (view == IntPtr.Zero) return true;
      list = FindWindowEx(view, IntPtr.Zero, "SysListView32", "FolderView");
      return list == IntPtr.Zero;
    }, IntPtr.Zero);
    return list;
  }

  private static long WindowStyle(IntPtr window) {
    return (IntPtr.Size == 8 ? GetWindowLongPtr64(window, -16) : GetWindowLong32(window, -16)).ToInt64();
  }

  private static bool Intersects(int x, int y, int cellWidth, int cellHeight, RECT reserved) {
    return x < reserved.Right && x + cellWidth > reserved.Left && y < reserved.Bottom && y + cellHeight > reserved.Top;
  }

  private static long PackedPosition(int x, int y) {
    return (long)((uint)(ushort)x | ((uint)(ushort)y << 16));
  }

  private static string Encode(string value) {
    return Convert.ToBase64String(Encoding.UTF8.GetBytes(value));
  }

  private static string Decode(string value) {
    return Encoding.UTF8.GetString(Convert.FromBase64String(value));
  }

  private static List<POINT> ReadPositions(IntPtr listView, int count) {
    uint processId;
    GetWindowThreadProcessId(listView, out processId);
    IntPtr process = OpenProcess(0x0018U | 0x0400U, false, processId);
    if (process == IntPtr.Zero) throw new InvalidOperationException("OPEN_EXPLORER_FAILED");
    IntPtr remotePoint = VirtualAllocEx(process, IntPtr.Zero, new UIntPtr(8), 0x1000U | 0x2000U, 0x04U);
    if (remotePoint == IntPtr.Zero) { CloseHandle(process); throw new InvalidOperationException("ALLOC_POINT_FAILED"); }
    try {
      var points = new List<POINT>();
      for (int index = 0; index < count; index += 1) {
        if (SendMessage(listView, LVM_GETITEMPOSITION, new IntPtr(index), remotePoint) == IntPtr.Zero) throw new InvalidOperationException("READ_POSITION_FAILED");
        byte[] bytes = new byte[8];
        UIntPtr bytesRead;
        if (!ReadProcessMemory(process, remotePoint, bytes, new UIntPtr(8), out bytesRead) || bytesRead.ToUInt64() < 8) throw new InvalidOperationException("READ_POINT_FAILED");
        points.Add(new POINT { X = BitConverter.ToInt32(bytes, 0), Y = BitConverter.ToInt32(bytes, 4) });
      }
      return points;
    } finally {
      VirtualFreeEx(process, remotePoint, UIntPtr.Zero, 0x8000U);
      CloseHandle(process);
    }
  }

  public static string Reserve(UInt64 childValue) {
    IntPtr child = new IntPtr(unchecked((long)childValue));
    IntPtr listView = DesktopListView();
    if (child == IntPtr.Zero || listView == IntPtr.Zero) throw new InvalidOperationException("DESKTOP_LISTVIEW_NOT_FOUND");
    int count = SendMessage(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
    if (count <= 0) return Encode("0|");

    RECT childRect;
    RECT clientRect;
    if (!GetWindowRect(child, out childRect) || !GetClientRect(listView, out clientRect)) throw new InvalidOperationException("DESKTOP_BOUNDS_FAILED");
    POINT reservedOrigin = new POINT { X = childRect.Left, Y = childRect.Top };
    if (!ScreenToClient(listView, ref reservedOrigin)) throw new InvalidOperationException("DESKTOP_COORDINATES_FAILED");
    RECT reserved = new RECT {
      Left = reservedOrigin.X - 10,
      Top = reservedOrigin.Y - 10,
      Right = reservedOrigin.X + (childRect.Right - childRect.Left) + 10,
      Bottom = reservedOrigin.Y + (childRect.Bottom - childRect.Top) + 10
    };

    long spacing = SendMessage(listView, LVM_GETITEMSPACING, IntPtr.Zero, IntPtr.Zero).ToInt64();
    int spacingX = (int)(spacing & 0xffff);
    int spacingY = (int)((spacing >> 16) & 0xffff);
    if (spacingX < 32) spacingX = 76;
    if (spacingY < 32) spacingY = 76;
    var points = ReadPositions(listView, count);
    var conflicts = Enumerable.Range(0, count).Where(i => Intersects(points[i].X, points[i].Y, spacingX, spacingY, reserved)).ToList();
    if (conflicts.Count == 0) return Encode(count + "|");
    if ((WindowStyle(listView) & LVS_AUTOARRANGE) != 0) throw new InvalidOperationException("DESKTOP_AUTO_ARRANGE_ENABLED");

    int offsetX = ((points.Min(point => point.X) % spacingX) + spacingX) % spacingX;
    int offsetY = ((points.Min(point => point.Y) % spacingY) + spacingY) % spacingY;
    var occupied = new HashSet<string>(points.Select(point => point.X + "," + point.Y));
    foreach (int index in conflicts) occupied.Remove(points[index].X + "," + points[index].Y);
    var slots = new List<POINT>();
    for (int x = offsetX; x + spacingX <= clientRect.Right; x += spacingX) {
      for (int y = offsetY; y + spacingY <= clientRect.Bottom; y += spacingY) {
        string key = x + "," + y;
        if (!occupied.Contains(key) && !Intersects(x, y, spacingX, spacingY, reserved)) slots.Add(new POINT { X = x, Y = y });
      }
    }
    if (slots.Count < conflicts.Count) throw new InvalidOperationException("DESKTOP_NO_FREE_ICON_CELLS");

    var moved = new List<string>();
    foreach (int index in conflicts) {
      POINT original = points[index];
      POINT target = slots.OrderBy(slot => Math.Abs(slot.X - original.X) + Math.Abs(slot.Y - original.Y)).First();
      slots.Remove(target);
      if (SendMessage(listView, LVM_SETITEMPOSITION, new IntPtr(index), new IntPtr(PackedPosition(target.X, target.Y))) == IntPtr.Zero) throw new InvalidOperationException("MOVE_ICON_FAILED");
      occupied.Add(target.X + "," + target.Y);
      moved.Add(index + "," + original.X + "," + original.Y);
    }
    return Encode(count + "|" + string.Join(";", moved));
  }

  public static int Restore(string encodedSnapshot) {
    if (String.IsNullOrWhiteSpace(encodedSnapshot)) return 0;
    IntPtr listView = DesktopListView();
    if (listView == IntPtr.Zero) return 2;
    string[] parts = Decode(encodedSnapshot).Split(new[] { '|' }, 2);
    int expectedCount;
    if (parts.Length != 2 || !Int32.TryParse(parts[0], out expectedCount)) return 3;
    int currentCount = SendMessage(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
    if (currentCount != expectedCount) return 4;
    if (String.IsNullOrWhiteSpace(parts[1])) return 0;
    foreach (string item in parts[1].Split(';')) {
      string[] fields = item.Split(',');
      if (fields.Length != 3) continue;
      int index, x, y;
      if (!Int32.TryParse(fields[0], out index) || !Int32.TryParse(fields[1], out x) || !Int32.TryParse(fields[2], out y)) continue;
      SendMessage(listView, LVM_SETITEMPOSITION, new IntPtr(index), new IntPtr(PackedPosition(x, y)));
    }
    return 0;
  }
}
'@

Add-Type -TypeDefinition $source

if ($operation -eq 'reserve') {
  $reservation = [YanjiDesktopIcons]::Reserve($childHandle)
  Write-Output "YANJI_DESKTOP_RESERVATION=$reservation"
  exit 0
}

if ($operation -eq 'restore') {
  $restoreResult = [YanjiDesktopIcons]::Restore($snapshot)
  Write-Output "YANJI_DESKTOP_RESTORE=$restoreResult"
  exit $restoreResult
}

throw 'Unknown desktop icon operation.'
