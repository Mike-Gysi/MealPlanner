import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../contexts/HouseholdContext'
import { notifyUser } from '../lib/notifications'
import { format, isToday, parseISO } from 'date-fns'
import type { HouseholdMember } from '../types'

interface Message {
  id: string
  household_id: string
  sender_id: string | null
  sender_username: string
  recipient_id: string
  recipient_username: string
  body: string
  read: boolean
  created_at: string
  todo_id?: string | null
}

export default function MessagesPage() {
  const navigate = useNavigate()
  const { household, members } = useHousehold()
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUsername, setCurrentUsername] = useState('')
  const [chatWith, setChatWith] = useState<HouseholdMember | null>(null)

  // Chat state
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? '')
      setCurrentUsername(data.user?.user_metadata?.username ?? '')
    })
  }, [])

  // Fetch all messages involving current user (for member list summaries)
  useEffect(() => {
    if (!currentUserId) return
    fetchAll()
    const channel = supabase.channel('messages-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId])

  // Fetch + subscribe to the open conversation
  useEffect(() => {
    if (!chatWith || !currentUserId) return
    fetchConversation(chatWith)
    markRead(chatWith)
    const channel = supabase.channel(`chat-${chatWith.user_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message
        const isForThisChat =
          (msg.sender_id === currentUserId && msg.recipient_id === chatWith.user_id) ||
          (msg.sender_id === chatWith.user_id && msg.recipient_id === currentUserId)
        if (!isForThisChat) return
        // Add if not already present (avoids duplicating the optimistic message)
        setChatMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        if (msg.sender_id === chatWith.user_id) markRead(chatWith)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chatWith?.user_id, currentUserId])

  // Scroll to bottom whenever chat messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  async function fetchAll() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false })
    setAllMessages(data ?? [])
    setLoading(false)
  }

  async function fetchConversation(member: HouseholdMember) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .in('sender_id', [currentUserId, member.user_id])
      .in('recipient_id', [currentUserId, member.user_id])
      .order('created_at', { ascending: true })
    setChatMessages(data ?? [])
  }

  async function markRead(member: HouseholdMember) {
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', member.user_id)
      .eq('recipient_id', currentUserId)
      .eq('read', false)
    setAllMessages(prev =>
      prev.map(m =>
        m.sender_id === member.user_id && m.recipient_id === currentUserId
          ? { ...m, read: true }
          : m
      )
    )
  }

  async function sendMessage() {
    if (!draft.trim() || !chatWith || !household) return
    const body = draft.trim()
    setDraft('')
    setSending(true)

    // Show the message immediately without waiting for the round-trip
    const tempId = `temp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      household_id: household.id,
      sender_id: currentUserId,
      sender_username: currentUsername,
      recipient_id: chatWith.user_id,
      recipient_username: chatWith.username,
      body,
      read: false,
      created_at: new Date().toISOString(),
    }
    setChatMessages(prev => [...prev, optimistic])

    const { data } = await supabase
      .from('messages')
      .insert({
        household_id: household.id,
        sender_id: currentUserId,
        sender_username: currentUsername,
        recipient_id: chatWith.user_id,
        recipient_username: chatWith.username,
        body,
        read: false,
      })
      .select()
      .single()

    // Swap the temp entry for the real DB record (gives it the proper UUID + server timestamp)
    if (data) {
      setChatMessages(prev => prev.map(m => m.id === tempId ? data as Message : m))
    }

    notifyUser(chatWith.user_id, currentUserId, household.id, `Message from ${currentUsername}`, body)
    setSending(false)
  }

  function openChat(member: HouseholdMember) {
    setChatMessages([])
    setChatWith(member)
  }

  function closeChat() {
    setChatWith(null)
    setChatMessages([])
  }

  function getConversationMeta(member: HouseholdMember) {
    const msgs = allMessages.filter(
      m =>
        (m.sender_id === currentUserId && m.recipient_id === member.user_id) ||
        (m.sender_id === member.user_id && m.recipient_id === currentUserId)
    )
    const last = msgs[0]
    const unread = msgs.filter(m => m.sender_id === member.user_id && !m.read).length
    return { last, unread }
  }

  function formatTime(str: string) {
    const d = parseISO(str)
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'd MMM')
  }

  const otherMembers = members.filter(m => m.user_id !== currentUserId)

  // ── Chat view ──────────────────────────────────────────────────────────────
  if (chatWith) {
    return (
      <div className="flex flex-col h-full">
        {/* Chat header */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={closeChat}
            className="text-zinc-400 hover:text-zinc-100 transition-colors text-2xl leading-none w-8 flex-shrink-0"
          >
            ‹
          </button>
          <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-green-400">
              {chatWith.username[0].toUpperCase()}
            </span>
          </div>
          <span className="text-sm font-semibold text-zinc-100">{chatWith.username}</span>
        </div>

        {/* Message bubbles */}
        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 flex flex-col gap-1.5">
          {chatMessages.length === 0 && (
            <p className="text-center text-zinc-600 text-sm py-10">No messages yet. Say hi!</p>
          )}
          {chatMessages.map((msg, i) => {
            const isMine = msg.sender_id === currentUserId
            const prevMsg = chatMessages[i - 1]
            const showTime =
              !prevMsg ||
              parseISO(msg.created_at).getTime() - parseISO(prevMsg.created_at).getTime() > 5 * 60 * 1000

            return (
              <div key={msg.id}>
                {showTime && (
                  <p className="text-center text-[10px] text-zinc-600 my-2">
                    {formatTime(msg.created_at)}
                  </p>
                )}
                <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {msg.todo_id ? (
                    <button
                      onClick={() => navigate(`/todos?edit=${msg.todo_id}`)}
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-left transition-colors ${
                        isMine
                          ? 'bg-green-500 hover:bg-green-400 text-zinc-950 rounded-br-sm'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-bl-sm'
                      }`}
                    >
                      <p className="text-sm leading-snug whitespace-pre-wrap break-words">{msg.body}</p>
                      <p className={`text-xs mt-1.5 font-medium flex items-center gap-1 ${isMine ? 'text-zinc-900/70' : 'text-green-400'}`}>
                        <span>→</span> Open todo
                      </p>
                    </button>
                  ) : (
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                        isMine
                          ? 'bg-green-500 text-zinc-950 rounded-br-sm'
                          : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                      }`}
                    >
                      <p className="text-sm leading-snug whitespace-pre-wrap break-words">{msg.body}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="bg-zinc-900 border-t border-zinc-800 px-3 py-3 flex gap-2 flex-shrink-0">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder={`Message ${chatWith.username}…`}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !draft.trim()}
            className="w-11 h-11 bg-green-500 hover:bg-green-400 disabled:opacity-30 text-zinc-950 rounded-xl flex items-center justify-center text-lg font-bold transition-colors flex-shrink-0"
          >
            ↑
          </button>
        </div>
      </div>
    )
  }

  // ── Member list view ───────────────────────────────────────────────────────
  return (
    <div className="max-w-sm mx-auto px-4 py-6 flex flex-col gap-4">
      <h2 className="text-xl font-bold text-zinc-100">Messages</h2>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : otherMembers.length === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-10">No other household members yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {otherMembers.map(member => {
            const { last, unread } = getConversationMeta(member)
            return (
              <button
                key={member.user_id}
                onClick={() => openChat(member)}
                className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3.5 hover:border-zinc-700 hover:bg-zinc-800/50 active:bg-zinc-800 transition-colors text-left w-full"
              >
                {/* Avatar with unread badge */}
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                    <span className="text-base font-bold text-green-400">
                      {member.username[0].toUpperCase()}
                    </span>
                  </div>
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center px-0.5 leading-none">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </div>

                {/* Name + preview */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className={`text-sm font-semibold ${unread > 0 ? 'text-zinc-100' : 'text-zinc-300'}`}>
                      {member.username}
                    </span>
                    {last && (
                      <span className="text-[10px] text-zinc-600 flex-shrink-0">
                        {formatTime(last.created_at)}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${unread > 0 ? 'text-zinc-300 font-medium' : 'text-zinc-500'}`}>
                    {last
                      ? (last.sender_id === currentUserId ? `You: ${last.body}` : last.body)
                      : 'No messages yet'}
                  </p>
                </div>

                <span className="text-zinc-700 text-lg flex-shrink-0">›</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
