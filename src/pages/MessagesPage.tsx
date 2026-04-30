import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../contexts/HouseholdContext'
import { notifyUser } from '../lib/notifications'
import { format, isToday, isYesterday, parseISO } from 'date-fns'

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
}

export default function MessagesPage() {
  const { household, members } = useHousehold()
  const [tab, setTab] = useState<'inbox' | 'compose'>('inbox')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUsername, setCurrentUsername] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Compose
  const [recipientUsername, setRecipientUsername] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentOk, setSentOk] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? '')
      setCurrentUsername(data.user?.user_metadata?.username ?? '')
    })
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    fetchMessages()
    const channel = supabase.channel('messages-inbox')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${currentUserId}`,
      }, () => fetchMessages())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId])

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false })
    setMessages(data ?? [])
    setLoading(false)
  }

  async function markRead(msg: Message) {
    if (msg.read) return
    await supabase.from('messages').update({ read: true }).eq('id', msg.id)
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m))
  }

  function toggleExpand(msg: Message) {
    if (expandedId === msg.id) {
      setExpandedId(null)
    } else {
      setExpandedId(msg.id)
      markRead(msg)
    }
  }

  async function sendMessage() {
    if (!body.trim() || !recipientUsername || !household) return
    const recipient = members.find(m => m.username === recipientUsername)
    if (!recipient) return
    setSending(true)
    await supabase.from('messages').insert({
      household_id: household.id,
      sender_id: currentUserId,
      sender_username: currentUsername,
      recipient_id: recipient.user_id,
      recipient_username: recipient.username,
      body: body.trim(),
      read: false,
    })
    notifyUser(recipient.user_id, currentUserId, household.id, `Message from ${currentUsername}`, body.trim())
    setBody('')
    setSending(false)
    setSentOk(true)
    setTimeout(() => setSentOk(false), 2500)
  }

  function formatDate(str: string) {
    const d = parseISO(str)
    if (isToday(d)) return format(d, 'HH:mm')
    if (isYesterday(d)) return 'Yesterday'
    return format(d, 'd MMM')
  }

  const unread = messages.filter(m => !m.read).length
  const otherMembers = members.filter(m => m.user_id !== currentUserId)

  return (
    <div className="max-w-sm mx-auto px-4 py-6 flex flex-col gap-4">
      <h2 className="text-xl font-bold text-zinc-100">Messages</h2>

      <div className="flex bg-zinc-800 rounded-xl p-1 gap-1">
        <button
          onClick={() => setTab('inbox')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            tab === 'inbox' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Inbox{unread > 0 ? ` (${unread})` : ''}
        </button>
        <button
          onClick={() => setTab('compose')}
          className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            tab === 'compose' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          New Message
        </button>
      </div>

      {tab === 'inbox' ? (
        loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-zinc-600 text-sm py-10">No messages yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map(msg => (
              <button
                key={msg.id}
                onClick={() => toggleExpand(msg)}
                className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                  !msg.read
                    ? 'bg-zinc-900 border-green-500/40'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {!msg.read && (
                      <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-zinc-200 truncate">
                      {msg.sender_username}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-600 flex-shrink-0">{formatDate(msg.created_at)}</span>
                </div>
                <p className={`text-xs leading-snug ${
                  expandedId === msg.id
                    ? 'text-zinc-300 whitespace-pre-wrap'
                    : 'text-zinc-500 truncate'
                }`}>
                  {msg.body}
                </p>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">To</label>
            {otherMembers.length === 0 ? (
              <p className="text-sm text-zinc-600">No other household members yet.</p>
            ) : (
              <select
                value={recipientUsername}
                onChange={e => setRecipientUsername(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              >
                <option value="">Select a member…</option>
                {otherMembers.map(m => (
                  <option key={m.user_id} value={m.username}>{m.username}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message…"
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all resize-none"
            />
          </div>

          {sentOk && (
            <p className="text-sm text-green-400 bg-green-400/10 rounded-lg px-3 py-2">Message sent!</p>
          )}

          <button
            onClick={sendMessage}
            disabled={sending || !body.trim() || !recipientUsername}
            className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
    </div>
  )
}
