export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; username: string; avatar_url: string | null; level: number; experience: number; created_at: string; updated_at: string };
        Insert: { id: string; username?: string; avatar_url?: string | null; level?: number; experience?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; username?: string; avatar_url?: string | null; level?: number; experience?: number; updated_at?: string };
        Relationships: [];
      };
      cards: {
        Row: { id: string; owner_id: string; card_type: "action" | "part" | "support"; parent_card_id: string | null; title: string; description: string | null; source_image_path: string | null; rendered_image_path: string | null; hp: number; atk: number; shield: number; speed: number; weight_ratio: string; skills: Json; program_flow: Json; generation_status: "draft" | "processing" | "ready" | "failed"; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; card_type: "action" | "part" | "support"; parent_card_id?: string | null; title: string; description?: string | null; source_image_path?: string | null; rendered_image_path?: string | null; hp?: number; atk?: number; shield?: number; speed?: number; weight_ratio?: string; skills?: Json; program_flow?: Json; generation_status?: "draft" | "processing" | "ready" | "failed"; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["cards"]["Insert"]>;
        Relationships: [];
      };
      card_skills: {
        Row: { id: string; card_id: string; slot: number; name: string; skill_type: "active" | "passive"; power: number; cost: number; program_flow: Json; created_at: string };
        Insert: { id?: string; card_id: string; slot: number; name: string; skill_type?: "active" | "passive"; power?: number; cost?: number; program_flow?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["card_skills"]["Insert"]>;
        Relationships: [];
      };
      decks: {
        Row: { id: string; owner_id: string; name: string; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; name?: string; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["decks"]["Insert"]>;
        Relationships: [];
      };
      deck_cards: {
        Row: { id: string; deck_id: string; card_id: string; slot_index: number; role: "action" | "part" | "support"; created_at: string };
        Insert: { id?: string; deck_id: string; card_id: string; slot_index: number; role: "action" | "part" | "support"; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["deck_cards"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      card_type: "action" | "part" | "support";
      skill_type: "active" | "passive";
      deck_card_role: "action" | "part" | "support";
    };
    CompositeTypes: Record<string, never>;
  };
};
