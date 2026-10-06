'use client';
import {Component,type ReactNode} from 'react';
import {AlertCircle,RefreshCw} from 'lucide-react';
/** Contains a crash to one page: the sidebar and navigation keep working, and moving to another page clears it. */
export default class ErrorBoundary extends Component<{resetKey:string;children:ReactNode},{error:Error|null}>{
 state={error:null as Error|null};
 static getDerivedStateFromError(error:Error){return {error};}
 componentDidCatch(error:Error){console.error('[grid] view error',error);}
 componentDidUpdate(prev:{resetKey:string}){if(prev.resetKey!==this.props.resetKey&&this.state.error)this.setState({error:null});}
 render(){
  if(!this.state.error)return this.props.children;
  return <div className="view-error" role="alert"><AlertCircle size={26}/><h2>This view couldn’t be shown.</h2><p>Your saved work is safe. Try again, or pick another page from the sidebar.</p><button className="button primary" onClick={()=>this.setState({error:null})}><RefreshCw size={15}/>Try again</button></div>;
 }
}
