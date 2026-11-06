
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"last_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"first_name"?: string,"id": string,"last_name"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"last_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "client_contact_email": string | null,"client_contact_name": string | null,"client_name": string | null,"code": string,"cover_image_path": string | null,"created_at": string,"description": string | null,"id": string,"location_address": string | null,"location_city": string | null,"location_country": string | null,"location_lat": number | null,"location_lng": number | null,"name": string,"planned_finish_date": string | null,"project_type": string | null,"sector": string | null,"stage": string | null,"start_date": string | null,"status": string,"status_date": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_contact_email"?: string | null,"client_contact_name"?: string | null,"client_name"?: string | null,"code": string,"cover_image_path"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"location_address"?: string | null,"location_city"?: string | null,"location_country"?: string | null,"location_lat"?: number | null,"location_lng"?: number | null,"name": string,"planned_finish_date"?: string | null,"project_type"?: string | null,"sector"?: string | null,"stage"?: string | null,"start_date"?: string | null,"status"?: string,"status_date"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "client_contact_email"?: string | null,"client_contact_name"?: string | null,"client_name"?: string | null,"code"?: string,"cover_image_path"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"location_address"?: string | null,"location_city"?: string | null,"location_country"?: string | null,"location_lat"?: number | null,"location_lng"?: number | null,"name"?: string,"planned_finish_date"?: string | null,"project_type"?: string | null,"sector"?: string | null,"stage"?: string | null,"start_date"?: string | null,"status"?: string,"status_date"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspace_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_shares": {
                  Row: {
                    "id": string,"schedule_id": string,"shared_at": string,"shared_by": string,"shared_with": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"schedule_id": string,"shared_at"?: string,"shared_by": string,"shared_with": string
                  }
                  Update: {
                    "id"?: string,"schedule_id"?: string,"shared_at"?: string,"shared_by"?: string,"shared_with"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_shares_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "schedules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_shares_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["schedule_id"]
    },{
      foreignKeyName: "schedule_shares_shared_by_fkey"
      columns: ["shared_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_shares_shared_by_fkey"
      columns: ["shared_by"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["shared_by_id"]
    },{
      foreignKeyName: "schedule_shares_shared_with_fkey"
      columns: ["shared_with"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_shares_shared_with_fkey"
      columns: ["shared_with"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["shared_by_id"]
    }
                  ]
                },"schedules": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"project_id": string,"source": string,"source_file_name": string | null,"source_file_path": string | null,"status_date": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"project_id": string,"source": string,"source_file_name"?: string | null,"source_file_path"?: string | null,"status_date"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"project_id"?: string,"source"?: string,"source_file_name"?: string | null,"source_file_path"?: string | null,"status_date"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedules_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedules_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedules_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["project_id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "plan": string,"trial_ends_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "plan"?: string,"trial_ends_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "plan"?: string,"trial_ends_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "shared_with_me"
      referencedColumns: ["shared_by_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "assignee_id": string,"created_at": string,"done": boolean,"due_date": string | null,"id": string,"project_id": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_id": string,"created_at"?: string,"done"?: boolean,"due_date"?: string | null,"id"?: string,"project_id"?: string | null,"title": string
                  }
                  Update: {
                    "assignee_id"?: string,"created_at"?: string,"done"?: boolean,"due_date"?: string | null,"id"?: string,"project_id"?: string | null,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_assignee_id_fkey"
      columns: ["assignee_id"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["shared_by_id"]
    },{
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "project_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["project_id"]
    }
                  ]
                },"workspace_invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"role": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role": string,"workspace_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"role"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["shared_by_id"]
    },{
      foreignKeyName: "workspace_invitations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspace_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_invitations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "joined_at": string,"role": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "joined_at"?: string,"role": string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "joined_at"?: string,"role"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["shared_by_id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspace_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"kind": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspaces_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspaces_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["shared_by_id"]
    }
                  ]
                }
          }
          Views: {
            "project_summaries": {
                  Row: {
                    "client_contact_email": string | null,"client_contact_name": string | null,"client_name": string | null,"code": string | null,"cover_image_path": string | null,"created_at": string | null,"description": string | null,"id": string | null,"location_address": string | null,"location_city": string | null,"location_country": string | null,"location_lat": number | null,"location_lng": number | null,"name": string | null,"planned_finish_date": string | null,"project_type": string | null,"schedule_count": number | null,"sector": string | null,"stage": string | null,"start_date": string | null,"status": string | null,"status_date": string | null,"total_schedule_count": number | null,"updated_at": string | null,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "client_contact_email"?: string | null,"client_contact_name"?: string | null,"client_name"?: string | null,"code"?: string | null,"cover_image_path"?: string | null,"created_at"?: string | null,"description"?: string | null,"id"?: string | null,"location_address"?: string | null,"location_city"?: string | null,"location_country"?: string | null,"location_lat"?: number | null,"location_lng"?: number | null,"name"?: string | null,"planned_finish_date"?: string | null,"project_type"?: string | null,"schedule_count"?: never,"sector"?: string | null,"stage"?: string | null,"start_date"?: string | null,"status"?: string | null,"status_date"?: string | null,"total_schedule_count"?: never,"updated_at"?: string | null,"workspace_id"?: string | null
                         }
                        Update: {
                           "client_contact_email"?: string | null,"client_contact_name"?: string | null,"client_name"?: string | null,"code"?: string | null,"cover_image_path"?: string | null,"created_at"?: string | null,"description"?: string | null,"id"?: string | null,"location_address"?: string | null,"location_city"?: string | null,"location_country"?: string | null,"location_lat"?: number | null,"location_lng"?: number | null,"name"?: string | null,"planned_finish_date"?: string | null,"project_type"?: string | null,"schedule_count"?: never,"sector"?: string | null,"stage"?: string | null,"start_date"?: string | null,"status"?: string | null,"status_date"?: string | null,"total_schedule_count"?: never,"updated_at"?: string | null,"workspace_id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspace_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"shared_with_me": {
                  Row: {
                    "project_id": string | null,"project_name": string | null,"schedule_id": string | null,"schedule_name": string | null,"share_id": string | null,"shared_at": string | null,"shared_by_avatar_url": string | null,"shared_by_first_name": string | null,"shared_by_id": string | null,"shared_by_last_name": string | null,"status_date": string | null,"workspace_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspace_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_summaries": {
                  Row: {
                    "created_at": string | null,"created_by": string | null,"id": string | null,"kind": string | null,"my_role": string | null,"name": string | null,"project_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "created_at"?: string | null,"created_by"?: string | null,"id"?: string | null,"kind"?: string | null,"my_role"?: never,"name"?: string | null,"project_count"?: never
                         }
                        Update: {
                           "created_at"?: string | null,"created_by"?: string | null,"id"?: string | null,"kind"?: string | null,"my_role"?: never,"name"?: string | null,"project_count"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "workspaces_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspaces_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "shared_with_me"
      referencedColumns: ["shared_by_id"]
    }
                  ]
                }
          }
          Functions: {
            "account_by_email":
{ Args: { "p_email": string }; Returns: {
              "confirmed": boolean,"user_id": string
            }[]
                           },
"create_team_workspace":
{ Args: { "p_name": string }; Returns: {
              "created_at": string | null,
"created_by": string | null,
"id": string | null,
"kind": string | null,
"my_role": string | null,
"name": string | null,
"project_count": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "workspace_summaries"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_project":
{ Args: { "p_project_id": string }; Returns: {
              "bucket": string,"path": string
            }[]
                           },
"is_project_code_available":
{ Args: { "p_code": string,"p_workspace_id": string }; Returns: boolean
                           },
"remove_member":
{ Args: { "p_user_id": string,"p_workspace_id": string }; Returns: undefined
                           },
"save_invitation":
{ Args: { "p_email": string,"p_invited_by": string,"p_role": string,"p_user_id": string,"p_workspace_id": string }; Returns: string
                           },
"update_member_role":
{ Args: { "p_role": string,"p_user_id": string,"p_workspace_id": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
