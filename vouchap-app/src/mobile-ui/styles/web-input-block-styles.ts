/**
 * Shared styles for the web input block: used by chat-to-log (right panel) and WebChatFab (floating expanded).
 * Keeps layout and dimensions identical between the two.
 */
import { StyleSheet } from 'react-native';

export const webInputBlockStyles = StyleSheet.create({
  webInputOuter: {
    flex: 1,
    minWidth: 0,
  },
  webInputBlock: {
    backgroundColor: '#fff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    minWidth: 0,
  },
  webInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 44,
  },
  webInputWrapper: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  webInput: {
    flex: 1,
    minHeight: 24,
    maxHeight: 120,
    padding: 0,
    fontSize: 15,
    color: '#2D3436',
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  webInputActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
    minHeight: 44,
  },
  /** 左侧图标 + 类型选单为一组，选单相对左侧固定不随文案宽度跳动 */
  webInputActionsLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webInputActionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  webActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  webTypeDropdownWrap: {
    position: 'relative',
    marginRight: 4,
  },
  webTypeDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    minWidth: 200,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  webTypeDropdownTriggerHover: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  webTypeDropdownLabel: {
    fontSize: 14,
    color: '#2D3436',
    fontWeight: '500',
  },
  webTypeDropdownMenu: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 220,
    zIndex: 50,
  },
  webTypeDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 220,
  },
  webTypeDropdownItemActive: {
    backgroundColor: 'transparent',
  },
  webTypeDropdownItemHover: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  webTypeDropdownItemText: {
    fontSize: 14,
    color: '#2D3436',
  },
  webTypeDropdownItemTextActive: {
    color: '#6C5CE7',
    fontWeight: '600',
  },
  webInputDisclaimer: {
    fontSize: 12,
    color: '#95A5A6',
    textAlign: 'center',
    marginTop: 10,
  },
  stagedFilesRow: {
    marginBottom: 4,
  },
  stagedFilesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stagedFileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 6,
    borderRadius: 12,
    backgroundColor: '#F1F3F5',
    width: '48%',
    minWidth: 0,
  },
  stagedFileThumbWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E9ECEF',
  },
  stagedFileThumb: {
    width: '100%',
    height: '100%',
  },
  stagedFileThumbDocIcon: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stagedFileChipText: {
    fontSize: 12,
    color: '#2D3436',
    flex: 1,
    minWidth: 0,
  },
});
