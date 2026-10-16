import {
  BookOpen,
  ChevronDown,
  CreditCard,
  ExternalLink,
  LogOut,
  Moon,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import type { ReactElement } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import {
  FOCUS_OUTLINE_CLASSES,
  MENU_ITEM_FOCUS_CLASSES,
  POPOVER_SHELL_CLASSES,
} from '@/components/layout/top-bar-parts';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { brand } from '@/config/brand';
import type { User } from '@/data/types';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTheme } from '@/hooks/useTheme';
import { errorMessage, fullName, initials } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec §6.7: items 32 tall with 16 px icons. Keyboard focus also gets the ring-colored outline,
// since the accent background alone is too faint to show focus.
const ITEM_CLASSES = cn('h-8 py-0', MENU_ITEM_FOCUS_CLASSES);

function Avatar({ user, failed }: { user: User | undefined; failed: boolean }): ReactElement {
  if (user?.avatarUrl) {
    return (
      <img src={user.avatarUrl} alt="" className="size-8 shrink-0 rounded-full object-cover" />
    );
  }
  if (user === undefined && !failed) return <Skeleton className="size-8 shrink-0 rounded-full" />;
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground"
    >
      {user ? initials(user) : <UserIcon className="size-4" />}
    </span>
  );
}

/** Account trigger and menu (spec §6.4, §6.7). */
export function UserMenu(): ReactElement {
  const { data: user, isError } = useCurrentUser();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const name = user ? fullName(user) : '';
  const ThemeIcon = theme === 'dark' ? Sun : Moon;

  const logOut = async () => {
    try {
      await signOut();
      void navigate('/sign-in', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={name ? `Account menu for ${name}` : 'Account menu'}
          className={cn(
            'flex h-9 shrink-0 items-center gap-2 rounded-md px-1.5 hover:bg-accent',
            FOCUS_OUTLINE_CLASSES,
          )}
        >
          <Avatar user={user} failed={isError} />
          {user && user.firstName.trim() !== '' && (
            <span className="hidden max-w-[120px] truncate text-sm font-medium sm:block">
              {user.firstName}
            </span>
          )}
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={6}
          className={cn(
            POPOVER_SHELL_CLASSES,
            'max-h-(--radix-dropdown-menu-content-available-height) w-[220px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto',
          )}
        >
          {user && (
            <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
              {name && <span className="truncate text-sm font-semibold">{name}</span>}
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
          )}
          <DropdownMenuItem asChild className={ITEM_CLASSES}>
            <Link to="/settings/profile">
              <UserIcon aria-hidden="true" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={ITEM_CLASSES}>
            <a href={brand.docsUrl} target="_blank" rel="noreferrer">
              <BookOpen aria-hidden="true" />
              Documentation
              <ExternalLink className="ml-auto size-3" aria-hidden="true" />
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={ITEM_CLASSES}>
            <Link to="/settings/billing">
              <CreditCard aria-hidden="true" />
              Billing
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={ITEM_CLASSES} onSelect={toggleTheme}>
            <ThemeIcon aria-hidden="true" />
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className={ITEM_CLASSES} onSelect={() => void logOut()}>
            <LogOut aria-hidden="true" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenu>
  );
}
